import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as semver from 'semver';

const MINIMUM_CLI_VERSION = '1.1.1';
let statusBarItem: vscode.StatusBarItem;

/**
 * A promisified wrapper for running CLI commands.
 */
function runCliCommand(pythonPath: string, args: string[], cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const process = cp.spawn(pythonPath, args, { cwd });
        let stdout = '';
        let stderr = '';
        process.stdout.on('data', (data) => (stdout += data.toString()));
        process.stderr.on('data', (data) => (stderr += data.toString()));
        process.on('close', (code) => {
            if (code === 0) {
                resolve(stdout.trim());
            } else {
                reject(new Error(stderr.trim() || `CLI command failed with exit code ${code}`));
            }
        });
        process.on('error', (err) => reject(err));
    });
}

/**
 * Gets the version of the installed ai-docify CLI.
 */
async function getCliVersion(pythonPath: string, cwd: string): Promise<string | null> {
    try {
        const output = await runCliCommand(pythonPath, ['-m', 'ai_docify', '--version'], cwd);
        const match = output.match(/version\s+([\d.]+)/);
        return match ? match[1] : null;
    } catch (error) {
        console.error('Failed to get ai-docify version:', error);
        return null;
    }
}

/**
 * Checks if the installed CLI version meets the minimum requirement.
 */
async function checkCliVersion(pythonPath: string, cwd: string): Promise<boolean> {
    const installedVersion = await getCliVersion(pythonPath, cwd);
    if (!installedVersion) {
        vscode.window.showErrorMessage('ai-docify CLI not found. Please ensure it is installed and accessible.');
        return false;
    }
    if (semver.lt(installedVersion, MINIMUM_CLI_VERSION)) {
        vscode.window.showErrorMessage(
            `This feature requires ai-docify CLI version ${MINIMUM_CLI_VERSION} or higher. You have ${installedVersion}. Please run "pip install --upgrade ai-docify".`
        );
        return false;
    }
    return true;
}

export function activate(context: vscode.ExtensionContext) {
    // Register all commands
    context.subscriptions.push(
        vscode.commands.registerCommand('ai-docify.documentFile', handleDocumentFileCommand),
        vscode.commands.registerCommand('ai-docify.documentThisFunction', handleDocumentThisFunctionCommand),
        vscode.commands.registerCommand('ai-docify.stripDocs', handleStripDocs)
    );

    // Create and configure the status bar item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'ai-docify.documentFile'; // Can be changed to a menu later
    updateStatusBar();
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Register provider and listeners
    context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider(
            { scheme: 'file', language: 'python' },
            new DocifyCodeActionProvider(),
            { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
        ),
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('aiDocify')) {
                updateStatusBar();
            }
        })
    );
}

function updateStatusBar(): void {
    const config = vscode.workspace.getConfiguration('aiDocify');
    const provider = config.get<string>('provider') || 'openai';
    statusBarItem.text = `🤖 AI Docify (${provider})`;
    statusBarItem.tooltip = `AI Docify is configured to use the '${provider}' provider.`;
}

async function runGeneration(options: { filePath: string; functionName?: string }): Promise<void> {
    const { filePath, functionName } = options;
    const config = vscode.workspace.getConfiguration('aiDocify');
    const pythonPath = config.get<string>('pythonPath') || 'python';
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
    const cwd = workspaceFolder ? workspaceFolder.uri.fsPath : path.dirname(filePath);

    // If targeting a function, perform a version check first.
    if (functionName) {
        const isVersionOk = await checkCliVersion(pythonPath, cwd);
        if (!isVersionOk) return;
    }

    try {
        statusBarItem.text = `$(sync~spin) AI Docify...`;
        statusBarItem.tooltip = 'Generating documentation...';

        const docUri = vscode.Uri.file(filePath);
        const document = await vscode.workspace.openTextDocument(docUri);

        // Fetch config, model, provider, and mode from user
        const configOutput = await runCliCommand(pythonPath, ['-m', 'ai_docify', 'config'], cwd);
        const configData = JSON.parse(configOutput);
        
        const providers = Object.keys(configData);
        const defaultProvider = config.get<string>('provider') || 'openai';
        providers.sort((x, y) => (x === defaultProvider ? -1 : y === defaultProvider ? 1 : 0));
        const providerChoice = await vscode.window.showQuickPick(providers, { placeHolder: 'Select AI Provider' });
        if (!providerChoice) throw new Error('Provider selection cancelled.');

        const models = Object.keys(configData[providerChoice]);
        const defaultModel = config.get<string>('model') || 'gpt-5-mini';
        models.sort((x, y) => (x === defaultModel ? -1 : y === defaultModel ? 1 : 0));
        const modelChoice = await vscode.window.showQuickPick(models, { placeHolder: `Select Model for ${providerChoice}` });
        if (!modelChoice) throw new Error('Model selection cancelled.');
        
        // Build args for cost estimation
        const estimateArgs = ['-m', 'ai_docify', 'generate', filePath, '--provider', providerChoice, '--model', modelChoice, '--check'];
        if (functionName) {
            estimateArgs.push('--function', functionName);
        }

        const costOutput = await runCliCommand(pythonPath, estimateArgs, cwd);
        const costData = JSON.parse(costOutput);
        const mode = functionName ? 'inject' : 'rewrite'; // Mode is implied
        const msg = costData.currency === 'USD'
            ? `Tokens: ${costData.tokens}. Est. Cost: $${costData.input_cost.toFixed(5)}`
            : `Tokens: ${costData.tokens}. Cost: Free (Local)`;

        const userSelection = await vscode.window.showInformationMessage(`AI Docify (${functionName || 'file'}): ${msg}`, { modal: true }, "Proceed", "Cancel");
        if (userSelection !== 'Proceed') throw new Error('Operation cancelled by user.');

        // Build args for generation
        const outputDir = path.join(cwd, 'ai_output');
        const genArgs = ['-m', 'ai_docify', 'generate', filePath, '--provider', providerChoice, '--model', modelChoice, '--yes', '--output-dir', outputDir];
        if (functionName) {
            genArgs.push('--function', functionName);
        }
        
        await runCliCommand(pythonPath, genArgs, cwd);
        
        // Apply changes
        const ext = path.extname(filePath);
        const baseName = path.basename(filePath, ext);
        const genFilePath = path.join(outputDir, `${baseName}.doc${ext}`);

        if (fs.existsSync(genFilePath)) {
            const newContent = fs.readFileSync(genFilePath, 'utf-8');
            const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
            const edit = new vscode.WorkspaceEdit();
            edit.replace(docUri, fullRange, newContent);
            await vscode.workspace.applyEdit(edit);
            vscode.window.showInformationMessage('Docs Generated!');
        } else {
            throw new Error('Generated file not found.');
        }

    } catch (error: any) {
        if (error.message.includes('cancelled')) {
            console.log('AI Docify operation cancelled.');
        } else {
            vscode.window.showErrorMessage(`AI Docify failed: ${error.message}`);
        }
    } finally {
        updateStatusBar(); // Reset status bar
    }
}

// --- Command Handlers ---

async function handleDocumentFileCommand() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active file to document.');
        return;
    }
    await runGeneration({ filePath: editor.document.fileName });
}

async function handleDocumentThisFunctionCommand(document: vscode.TextDocument, functionName: string) {
    await runGeneration({ filePath: document.fileName, functionName });
}

async function handleStripDocs() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return; }

    const { document } = editor;
    const config = vscode.workspace.getConfiguration('aiDocify');
    const pythonPath = config.get<string>('pythonPath') || 'python';
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    const cwd = workspaceFolder ? workspaceFolder.uri.fsPath : path.dirname(document.fileName);

    try {
        statusBarItem.text = `$(sync~spin) Stripping...`;
        const args = ['-m', 'ai_docify', 'strip', document.fileName];
        await runCliCommand(pythonPath, args, cwd);

        const baseName = path.basename(document.fileName, path.extname(document.fileName));
        const strippedPath = path.join(cwd, 'stripped_scripts', `${baseName}_strip.py`);

        const action = await vscode.window.showInformationMessage(
            `Success! Stripped file saved to: stripped_scripts/${baseName}_strip.py`,
            'Open File'
        );

        if (action === 'Open File' && fs.existsSync(strippedPath)) {
            const strippedDoc = await vscode.workspace.openTextDocument(strippedPath);
            await vscode.window.showTextDocument(strippedDoc);
        }
    } catch (error: any) {
        vscode.window.showErrorMessage(`Strip failed: ${error.message}`);
    } finally {
        updateStatusBar();
    }
}

// --- Code Action Provider ---

export class DocifyCodeActionProvider implements vscode.CodeActionProvider {
    public provideCodeActions(document: vscode.TextDocument, range: vscode.Range): vscode.CodeAction[] | undefined {
        const line = document.lineAt(range.start.line);
        const functionRegex = /^\s*def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/;
        const match = line.text.match(functionRegex);

        if (match) {
            const functionName = match[1];
            const action = new vscode.CodeAction('AI Docify: Document this function', vscode.CodeActionKind.QuickFix);
            action.command = {
                command: 'ai-docify.documentThisFunction',
                title: 'Generate Docstring',
                arguments: [document, functionName]
            };
            return [action];
        }

        return;
    }
}

export function deactivate() {
    if (statusBarItem) {
        statusBarItem.dispose();
    }
}
