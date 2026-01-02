import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

/**
 * A promisified wrapper for running CLI commands.
 * @param pythonPath The path to the python executable.
 * @param args The arguments to pass to the command.
 * @param cwd The working directory to run the command in.
 * @returns A promise that resolves with the command's stdout or rejects with an error.
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
                reject(new Error(stderr.trim()));
            }
        });
        process.on('error', (err) => {
            reject(err);
        });
    });
}

export function activate(context: vscode.ExtensionContext) {
    console.log('AI Docify extension is now active!');

    const docDisposable = vscode.commands.registerCommand('ai-docify.documentFile', () => handleDocumentFile());
    const stripDisposable = vscode.commands.registerCommand('ai-docify.stripDocs', () => handleStripDocs());

    context.subscriptions.push(docDisposable, stripDisposable);
}

async function handleDocumentFile() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active file found.');
        return;
    }

    const { document } = editor;
    const config = vscode.workspace.getConfiguration('aiDocify');
    const pythonPath = config.get<string>('pythonPath') || 'python';

    if (document.isDirty) {
        await document.save();
    }

    const filePath = document.fileName;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    const cwd = workspaceFolder ? workspaceFolder.uri.fsPath : path.dirname(filePath);
    const outputDir = path.join(cwd, 'ai_output');

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'AI Docify',
        cancellable: false
    }, async (progress) => {
        try {
            // 1. Fetch Config
            progress.report({ message: 'Fetching configuration...' });
            const configOutput = await runCliCommand(pythonPath, ['-m', 'ai_docify', 'config'], cwd);
            const configData = JSON.parse(configOutput);
            const providers = Object.keys(configData);

            // 2. Choose Provider
            const defaultProvider = config.get<string>('provider') || 'openai';
            providers.sort((x, y) => (x === defaultProvider ? -1 : y === defaultProvider ? 1 : 0));
            const providerChoice = await vscode.window.showQuickPick(providers, { placeHolder: 'Select AI Provider' });
            if (!providerChoice) return;

            // 3. Choose Model
            const models = Object.keys(configData[providerChoice]);
            const defaultModel = config.get<string>('model') || 'gpt-5-mini';
            models.sort((x, y) => (x === defaultModel ? -1 : y === defaultModel ? 1 : 0));
            const modelChoice = await vscode.window.showQuickPick(models, { placeHolder: `Select Model for ${providerChoice}` });
            if (!modelChoice) return;

            // 4. Choose Mode
            const modeChoice = await vscode.window.showQuickPick(
                [{ label: 'inject', description: 'Surgical docstring insertion (Safe)' }, { label: 'rewrite', description: 'Full file rewrite (Thorough)' }],
                { placeHolder: 'Select Documentation Mode' }
            );
            if (!modeChoice) return;
            const { label: mode } = modeChoice;

            // 5. Cost Estimation
            progress.report({ message: 'Estimating cost...' });
            const checkArgs = ['-m', 'ai_docify', 'generate', filePath, '--provider', providerChoice, '--model', modelChoice, '--mode', mode, '--check'];
            const costOutput = await runCliCommand(pythonPath, checkArgs, cwd);
            const costData = JSON.parse(costOutput);
            
            const msg = costData.currency === 'USD'
                ? `Tokens: ${costData.tokens}. Est. Cost: ${costData.input_cost.toFixed(5)}`
                : `Tokens: ${costData.tokens}. Cost: Free (Local)`;

            const userSelection = await vscode.window.showInformationMessage(`AI Docify (${mode}): ${msg}`, { modal: true }, "Proceed", "Cancel");
            if (userSelection !== 'Proceed') return;

            // 6. Execute Generation
            progress.report({ message: `Generating docs (${mode})...` });
            const genArgs = ['-m', 'ai_docify', 'generate', filePath, '--provider', providerChoice, '--model', modelChoice, '--mode', mode, '--yes', '--output-dir', outputDir];
            await runCliCommand(pythonPath, genArgs, cwd);

            const ext = path.extname(filePath);
            const baseName = path.basename(filePath, ext);
            const genFilePath = path.join(outputDir, `${baseName}.doc${ext}`);

            if (fs.existsSync(genFilePath)) {
                const newContent = fs.readFileSync(genFilePath, 'utf-8');
                const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
                await editor.edit(editBuilder => editBuilder.replace(fullRange, newContent));
                vscode.window.showInformationMessage('Docs Generated!');
            } else {
                throw new Error('Generated file not found.');
            }
        } catch (error: any) {
            vscode.window.showErrorMessage(`AI Docify failed: ${error.message}`);
        }
    });
}

async function handleStripDocs() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return; }

    const { document } = editor;
    const config = vscode.workspace.getConfiguration('aiDocify');
    const pythonPath = config.get<string>('pythonPath') || 'python';
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    const cwd = workspaceFolder ? workspaceFolder.uri.fsPath : path.dirname(document.fileName);

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'AI Docify',
        cancellable: false
    }, async (progress) => {
        try {
            progress.report({ message: 'Stripping docstrings...' });
            const args = ['-m', 'ai_docify', 'strip', document.fileName];
            await runCliCommand(pythonPath, args, cwd);

            const baseName = path.basename(document.fileName, path.extname(document.fileName));
            const strippedPath = path.join(cwd, 'stripped_scripts', `${baseName}_strip.py`);

            const action = await vscode.window.showInformationMessage(
                `Success! Stripped file saved to: stripped_scripts/${baseName}_strip.py`,
                'Open File'
            );

            if (action === 'Open File' && fs.existsSync(strippedPath)) {
                const doc = await vscode.workspace.openTextDocument(strippedPath);
                await vscode.window.showTextDocument(doc);
            }
        } catch (error: any) {
            vscode.window.showErrorMessage(`Strip failed: ${error.message}`);
        }
    });
}

export function deactivate() {}