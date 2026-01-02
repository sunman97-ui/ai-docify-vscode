import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export function activate(context: vscode.ExtensionContext) {
    console.log('AI Docify extension is now active!');

    // --- Command 1: Document File ---
    let docDisposable = vscode.commands.registerCommand('ai-docify.documentFile', async () => {
        await handleDocumentFile();
    });

    // --- Command 2: Strip Docstrings ---
    let stripDisposable = vscode.commands.registerCommand('ai-docify.stripDocs', async () => {
        await handleStripDocs();
    });

    context.subscriptions.push(docDisposable, stripDisposable);
}

async function handleDocumentFile() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active file found.');
        return;
    }

    const document = editor.document;
    const config = vscode.workspace.getConfiguration('aiDocify');
    const pythonPath = config.get<string>('pythonPath') || 'python';
    
    if (document.isDirty) {await document.save();}

    const filePath = document.fileName;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    const cwd = workspaceFolder ? workspaceFolder.uri.fsPath : path.dirname(filePath);
    const outputDir = path.join(cwd, 'ai_output');

    // 1. Fetch Config
    const configData = await fetchCliConfig(pythonPath, cwd);
    if (!configData) {return;}
    const providers = Object.keys(configData);
    
    // 2. Choose Provider
    const defaultProvider = config.get<string>('provider') || 'openai';
    providers.sort((x,y) => x === defaultProvider ? -1 : y === defaultProvider ? 1 : 0);
    const providerChoice = await vscode.window.showQuickPick(providers, { placeHolder: 'Select AI Provider' });
    if (!providerChoice) {return;}

    // 3. Choose Model
    const models = Object.keys(configData[providerChoice]);
    const defaultModel = config.get<string>('model') || 'gpt-5-mini';
    models.sort((x,y) => x === defaultModel ? -1 : y === defaultModel ? 1 : 0);
    const modelChoice = await vscode.window.showQuickPick(models, { placeHolder: `Select Model for ${providerChoice}` });
    if (!modelChoice) {return;}

    // 4. Choose Mode
    const modeChoice = await vscode.window.showQuickPick(
        [{ label: 'inject', description: 'Surgical docstring insertion (Safe)' }, { label: 'rewrite', description: 'Full file rewrite (Thorough)' }],
        { placeHolder: 'Select Documentation Mode' }
    );
    if (!modeChoice) {return;}
    const mode = modeChoice.label;

    // 5. Cost Estimation
    const checkArgs = ['-m', 'ai_docify', 'generate', filePath, '--provider', providerChoice, '--model', modelChoice, '--mode', mode, '--check'];

    vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `AI Docify: Estimating cost...`, cancellable: false }, async () => {
        return new Promise<void>((resolve) => {
            const process = cp.spawn(pythonPath, checkArgs, { cwd: cwd });
            let output = '';
            process.stdout.on('data', (data) => { output += data.toString(); });

            process.on('close', async (code) => {
                if (code !== 0) {
                    vscode.window.showErrorMessage(`Estimation Failed. Ensure 'ai-docify' is installed in your Python environment.`);
                    resolve();
                    return;
                }
                try {
                    const costData = JSON.parse(output.trim());
                    const msg = costData.currency === 'USD' 
                        ? `Tokens: ${costData.tokens}. Est. Cost: $${costData.input_cost.toFixed(5)}` 
                        : `Tokens: ${costData.tokens}. Cost: Free (Local)`;

                    const userSelection = await vscode.window.showInformationMessage(`AI Docify (${mode}): ${msg}`, { modal: true }, "Proceed", "Cancel");
                    if (userSelection === "Proceed") {
                        executeGeneration(pythonPath, filePath, providerChoice, modelChoice, mode, outputDir, cwd, editor, document);
                    }
                    resolve();
                } catch (e) {
                    vscode.window.showErrorMessage(`Failed to parse cost estimate.`);
                    resolve();
                }
            });
        });
    });
}

async function handleStripDocs() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {return;}

    const document = editor.document;
    const config = vscode.workspace.getConfiguration('aiDocify');
    const pythonPath = config.get<string>('pythonPath') || 'python';
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    const cwd = workspaceFolder ? workspaceFolder.uri.fsPath : path.dirname(document.fileName);

    vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Stripping docstrings..." }, async () => {
        const args = ['-m', 'ai_docify', 'strip', document.fileName];
        
        return new Promise<void>((resolve) => {
            const process = cp.spawn(pythonPath, args, { cwd: cwd });
            let errorOut = '';
            process.stderr.on('data', (d) => errorOut += d);

            process.on('close', async (code) => {
                if (code === 0) {
                    // Based on CLI logic, file is saved to 'stripped_scripts'
                    const baseName = path.basename(document.fileName, path.extname(document.fileName));
                    const strippedPath = path.join(cwd, 'stripped_scripts', `${baseName}_strip.py`);
                    
                    const action = await vscode.window.showInformationMessage(
                        `Success! Stripped file saved to: stripped_scripts/${baseName}_strip.py`,
                        "Open File"
                    );
                    
                    if (action === "Open File" && fs.existsSync(strippedPath)) {
                        const doc = await vscode.workspace.openTextDocument(strippedPath);
                        await vscode.window.showTextDocument(doc);
                    }
                } else {
                    vscode.window.showErrorMessage(`Strip failed: ${errorOut}`);
                }
                resolve();
            });
        });
    });
}

function fetchCliConfig(pythonPath: string, cwd: string): Promise<any> {
    return new Promise((resolve) => {
        const args = ['-m', 'ai_docify', 'config'];
        const process = cp.spawn(pythonPath, args, { cwd: cwd });
        let output = '';
        process.stdout.on('data', (data) => output += data.toString());
        process.on('close', (code) => {
            if (code !== 0) { resolve(null); return; }
            try { resolve(JSON.parse(output.trim())); } catch (e) { resolve(null); }
        });
    });
}

function executeGeneration(pythonPath: string, filePath: string, provider: string, model: string, mode: string, outputDir: string, cwd: string, editor: vscode.TextEditor, document: vscode.TextDocument) {
    const args = ['-m', 'ai_docify', 'generate', filePath, '--provider', provider, '--model', model, '--mode', mode, '--yes', '--output-dir', outputDir];

    vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Generating docs (${mode})...` }, async () => {
        const process = cp.spawn(pythonPath, args, { cwd: cwd });
        process.on('close', async (code) => {
            if (code === 0) {
                const ext = path.extname(filePath);
                const baseName = path.basename(filePath, ext);
                const genFilePath = path.join(outputDir, `${baseName}.doc${ext}`);
                
                if (fs.existsSync(genFilePath)) {
                    const newContent = fs.readFileSync(genFilePath, 'utf-8');
                    const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
                    await editor.edit(editBuilder => editBuilder.replace(fullRange, newContent));
                    vscode.window.showInformationMessage('Docs Generated!');
                }
            } else {
                vscode.window.showErrorMessage('Generation failed. Check console for details.');
            }
        });
    });
}

export function deactivate() {}