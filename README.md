# Git Code Reviewer

A VS Code extension that reviews your local git changes using GitHub Copilot's AI-powered code review capabilities.

## Features

- **AI-Powered Code Review**: Automatically reviews all your local git changes (both staged and unstaged) using GitHub Copilot
- **Interactive Chat Interface**: Get reviews directly in GitHub Copilot Chat where you can ask follow-up questions
- **Comprehensive Analysis**: Provides summary, identifies potential issues, suggests best practices, and highlights what was done well
- **Easy Access**: Available via `@code-reviewer` chat participant, Command Palette, or directly from the Source Control view
- **Conversational**: Ask the AI to explain specific changes, suggest alternatives, or dive deeper into any concerns

## Requirements

- **GitHub Copilot**: You must have GitHub Copilot enabled in VS Code
- **Git Repository**: Your workspace must be a git repository with local changes

## How to Use

### Method 1: Using Chat Participant

1. **Open a git repository** in VS Code
2. **Make some changes** to your files (edit, add, or delete files)
3. **Open GitHub Copilot Chat** (click the chat icon in the sidebar or press `Ctrl+Alt+I` / `Cmd+Alt+I`)
4. **Type** `@code-reviewer /review` and press Enter
5. The AI will analyze your changes and provide a detailed review
6. **Ask follow-up questions** in the chat to get clarifications or deeper insights

### Method 2: Using Command Palette

1. **Open a git repository** in VS Code
2. **Make some changes** to your files
3. **Open the Command Palette** (`Cmd+Shift+P` on Mac / `Ctrl+Shift+P` on Windows/Linux)
4. **Search for** "Review Git Changes with Copilot" and select it
5. This will open Copilot Chat with the review command automatically executed

### Method 3: Using Source Control View

1. **Open a git repository** in VS Code
2. **Make some changes** to your files
3. **Open the Source Control view** (click the Source Control icon in the sidebar or press `Ctrl+Shift+G` / `Cmd+Shift+G`)
4. **Click the review button** in the Source Control toolbar
5. This will open Copilot Chat and start the review automatically

## What Gets Reviewed

The extension reviews:

- Staged changes (`git diff --cached`)
- Unstaged changes (`git diff`)

The AI analysis includes:

- **Summary**: Overview of what changed
- **Potential Issues**: Bugs, security concerns, or code quality problems
- **Best Practices**: Suggestions for improvements
- **Positive Feedback**: What was done well

## Known Issues

- Very large diffs (>10MB) may cause performance issues
- Requires active GitHub Copilot subscription

## Release Notes

### 0.0.1

Initial release with AI-powered git code review functionality

---

**Enjoy AI-powered code reviews!**
