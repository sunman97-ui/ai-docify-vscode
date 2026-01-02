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

### 3. Usage

1. Open any Python file.
2. Press `Ctrl+Shift+P` (Command Palette).
3. Type **"AI Docify: Document Current File"**.
4. Select your Provider, Model, and Mode.
5. Confirm the cost estimate.

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
