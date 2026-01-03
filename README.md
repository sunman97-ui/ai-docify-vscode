[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/sunman97-ui.ai-docify-vscode?style=flat&label=VS%20Code%20Marketplace&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=sunman97-ui.ai-docify-vscode)

# AI Docify for VS Code

**AI Docify** is the intelligent documentation assistant for Python. It uses AST parsing to surgically inject NumPy/Sphinx docstrings into your code without breaking your logic.

> **Note:** This extension requires the `ai-docify` CLI tool.

## ✨ Features

* **🛡️ Surgical Injection:** Uses AST parsing to insert docstrings safely.
* **💰 Pre-Flight Cost Estimates:** See the exact cost (USD) and token count *before* you generate.
* **🧠 Dual AI Support:**
  * **OpenAI:** For high-precision, production-grade docs.
  * **Ollama:** For free, local, privacy-focused generation.
* **🎯 Per-Function Generation**: Use the "lightbulb" icon on any `def` line to document a single function instantly.
* **👁️ Status Bar Visibility**: See the active AI provider and generation status at a glance in the VS Code status bar.
* **⚡ Two Modes:**
  * **Inject:** Safe insertion (preserves formatting).
  * **Rewrite:** Full file refactor (good for legacy code).

## 🚀 Getting Started

### 1. Install the CLI

This extension relies on the Python CLI. Open your terminal and run:

```bash
pip install ai-docify

```

### 2. Configure (Optional)

Go to **Settings** (`Ctrl+,`) and search for `aiDocify`.

* **Python Path:** If you use a virtual environment, set this to your specific python executable (e.g., `${workspaceFolder}/.venv/bin/python`).
* **Default Provider:** Choose `openai` or `ollama`.

### 📖 Usage

There are two primary ways to use AI Docify:

### 1. Documenting a Single Function (Recommended Workflow)

This is the fastest and most common way to use the extension.

1.  Open any Python file.
2.  Click on a line containing a function definition (e.g., `def my_function():`).
3.  A **lightbulb icon** (💡) will appear. Click it.
4.  Select **"AI Docify: Document this function"** from the menu.
5.  Choose your AI Provider and Model, then confirm the cost estimate. The docstring will be generated and inserted for that function only.

### 2. Documenting an Entire File

This is useful for documenting legacy files or generating a first pass on a new module.

1.  Open the Python file you want to document.
2.  Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac) to open the Command Palette.
3.  Type and select **"AI Docify: Document Current File"**.
4.  You will be prompted to choose a `mode`:
    *   **`inject` (Recommended):** Safely inserts docstrings without changing any of your code.
    *   **`rewrite`:** Rewrites the entire file with docstrings included.
5.  Select your Provider and Model, then confirm the cost estimate.

## ⚙️ Extension Settings

| Setting | Description | Default |
| --- | --- | --- |
| `aiDocify.pythonPath` | Path to the Python executable. | `python` |
| `aiDocify.provider` | Default AI provider (openai/ollama). | `openai` |
| `aiDocify.model` | Default model (e.g., gpt-5-mini, llama3). | `gpt-5-mini` |

## 🔧 Troubleshooting

**"Module 'ai_docify' not found"**
Ensure you have installed the package in the *active* Python environment for your project.

```bash
pip install ai-docify

```

**"Generation Failed"**
Check the Developer Tools (`Help > Toggle Developer Tools`) for detailed logs.

## 📄 License

MIT License
