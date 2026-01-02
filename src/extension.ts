import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export function activate(context: vscode.ExtensionContext) {
    console.log('AI Docify extension is now active!');

    let disposable = vscode.commands.registerCommand('ai-docify.documentFile', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active file found.');
            return;
        }

        const document = editor.document;
        const config = vscode.workspace.getConfiguration('aiDocify');

        // 1. Get User Preferences (Interactive)
        // We let the user choose the Mode dynamically, as it changes file-to-file.
        const modeChoice = await vscode.window.showQuickPick(
            [
                { label: 'inject', description: 'Surgical docstring insertion (Best for preserving format)' },
                { label: 'rewrite', description: 'Full file rewrite (Best for coverage)' }
            ],
            { placeHolder: 'Select Documentation Mode' }
        );

        if (!modeChoice) {return;} // User cancelled
        const mode = modeChoice.label;

        // Provider/Model are sticky (from settings), but we load them now
        const pythonPath = config.get<string>('pythonPath') || 'python';
        const provider = config.get<string>('provider') || 'openai';
        const model = config.get<string>('model') || 'gpt-5-mini';

        if (document.isDirty) {
            await document.save();
        }

        const filePath = document.fileName;
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        const cwd = workspaceFolder ? workspaceFolder.uri.fsPath : path.dirname(filePath);
        const outputDir = path.join(cwd, 'ai_output');

        // --- PHASE 1: THE CHECK (Dry Run) ---
        // We call the CLI with --check to get the JSON cost
        const checkArgs = [
            '-m', 'ai_docify', 
            'generate',
            filePath,
            '--provider', provider,
            '--model', model,
            '--mode', mode,
            '--check' // <--- The secret sauce
        ];

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `AI Docify: Estimating cost...`,
            cancellable: false
        }, async () => {
            return new Promise<void>((resolve, reject) => {
                const process = cp.spawn(pythonPath, checkArgs, { cwd: cwd });
                let output = '';
                
                process.stdout.on('data', (data) => { output += data.toString(); });

                process.on('close', async (code) => {
                    if (code !== 0) {
                        vscode.window.showErrorMessage(`Estimation Failed. Check Debug Console/Output.`);
                        resolve();
                        return;
                    }

                    // Parse the JSON output from Python
                    try {
                        const costData = JSON.parse(output.trim());
                        const tokens = costData.tokens;
                        const cost = costData.input_cost;
                        const currency = costData.currency;

                        let message = `Input Tokens: ${tokens}. `;
                        if (currency === 'USD') {
                            message += `Estimated Cost: $${cost.toFixed(5)}`;
                        } else {
                            message += `Cost: Free (Local)`;
                        }

                        // --- PHASE 2: THE CONFIRMATION ---
                        const userSelection = await vscode.window.showInformationMessage(
                            `AI Docify (${model}): ${message}`,
                            { modal: true }, // Makes it a pop-up dialog
                            "Proceed",
                            "Cancel"
                        );

                        if (userSelection !== "Proceed") {
                            resolve(); // User cancelled
                            return;
                        }

                        // --- PHASE 3: EXECUTION ---
                        executeGeneration(pythonPath, filePath, provider, model, mode, outputDir, cwd, editor, document);
                        resolve();

                    } catch (e) {
                        vscode.window.showErrorMessage(`Failed to parse cost estimate: ${output}`);
                        resolve();
                    }
                });
            });
        });
    });

    context.subscriptions.push(disposable);
}

// Helper function to run the actual generation after confirmation
function executeGeneration(pythonPath: string, filePath: string, provider: string, model: string, mode: string, outputDir: string, cwd: string, editor: vscode.TextEditor, document: vscode.TextDocument) {
    const args = [
        '-m', 'ai_docify', 
        'generate',
        filePath,
        '--provider', provider,
        '--model', model,
        '--mode', mode,
        '--yes',       // We already confirmed in VS Code, so tell Python to skip prompt
        '--output-dir', outputDir
    ];

    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Generating docs (${mode})...`,
        cancellable: false
    }, async () => {
        return new Promise<void>((resolve) => {
            const process = cp.spawn(pythonPath, args, { cwd: cwd });
            let errorLog = '';

            process.stderr.on('data', (data) => errorLog += data.toString());

            process.on('close', async (code) => {
                if (code !== 0) {
                    vscode.window.showErrorMessage(`Generation Failed: ${errorLog}`);
                    resolve();
                    return;
                }

                // Read and Apply
                const ext = path.extname(filePath);
                const baseName = path.basename(filePath, ext);
                const genFileName = `${baseName}.doc${ext}`;
                const genFilePath = path.join(outputDir, genFileName);

                if (fs.existsSync(genFilePath)) {
                    const newContent = fs.readFileSync(genFilePath, 'utf-8');
                    const fullRange = new vscode.Range(
                        document.positionAt(0),
                        document.positionAt(document.getText().length)
                    );
                    await editor.edit(editBuilder => editBuilder.replace(fullRange, newContent));
                    vscode.window.showInformationMessage('Docs Generated!');
                }
                resolve();
            });
        });
    });
}

export function deactivate() {}