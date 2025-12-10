// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { exec } from 'child_process';
import * as util from 'util';

const execAsync = util.promisify(exec);

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "code-review" is now active!');

	// Create a chat participant for code review
	const codeReviewer = vscode.chat.createChatParticipant('code-review.code-reviewer', async (request: vscode.ChatRequest, context: vscode.ChatContext, stream: vscode.ChatResponseStream, token: vscode.CancellationToken) => {
		
		// Handle the "review" command
		if (request.command === 'review') {
			try {
				await handleReviewCommand(request, context, stream, token);
			} catch (error) {
				stream.markdown(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
			}
			return;
		}

		// Default handler for general conversation
		stream.markdown('I can help you review your git changes! Use the `/review` command to analyze your local changes, or ask me questions about code quality and best practices.\n\n');
		stream.markdown('**Available commands:**\n');
		stream.markdown('- `/review` - Review all local git changes (staged and unstaged)\n');
	});

	codeReviewer.iconPath = new vscode.ThemeIcon('search-view-icon');

	// Register the command to trigger review from command palette
	const reviewCommand = vscode.commands.registerCommand('code-review.reviewGitChanges', async () => {
		try {
			// Open chat and send the review command
			vscode.commands.executeCommand('workbench.action.chat.open', {
				query: '@code-reviewer /review'
			});
		} catch (error) {
			vscode.window.showErrorMessage(`Code review failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	});

	context.subscriptions.push(codeReviewer, reviewCommand);
}

async function handleReviewCommand(request: vscode.ChatRequest, context: vscode.ChatContext, stream: vscode.ChatResponseStream, token: vscode.CancellationToken) {
	// Get workspace folder
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders || workspaceFolders.length === 0) {
		stream.markdown('❌ No workspace folder open. Please open a git repository first.');
		return;
	}

	const workspaceRoot = workspaceFolders[0].uri.fsPath;

	// Show progress
	stream.progress('Fetching git changes...');

	// Get git changes using git command
	const gitChanges = await getGitChanges(workspaceRoot);
	
	if (!gitChanges || gitChanges.trim().length === 0) {
		stream.markdown('ℹ️ No local git changes to review. Make some changes to your files first!');
		return;
	}

	stream.progress('Analyzing changes with AI...');

	// Craft the prompt for code review
	const prompt = `You are an expert code reviewer. Please review the following git changes and provide:

1. **Summary**: A brief overview of what changed
2. **Potential Issues**: Any bugs, security concerns, or code quality problems
3. **Best Practices**: Suggestions for improvements following best practices
4. **Positive Feedback**: What was done well

Here are the git changes:

\`\`\`diff
${gitChanges}
\`\`\`

Please provide a thorough but concise code review.`;

	const messages = [
		vscode.LanguageModelChatMessage.User(prompt)
	];

	try {
		const chatResponse = await request.model.sendRequest(messages, {}, token);
		
		// Stream the response
		for await (const fragment of chatResponse.text) {
			stream.markdown(fragment);
		}

	} catch (err) {
		if (err instanceof vscode.LanguageModelError) {
			console.error('Language Model Error:', err.message, err.code, err.cause);
			stream.markdown(`\n\n❌ **Error**: ${err.message}`);
		} else {
			throw err;
		}
	}
}

async function getGitChanges(workspaceRoot: string): Promise<string> {
	try {
		// Get both staged and unstaged changes
		const { stdout: stagedDiff } = await execAsync('git diff --cached', { 
			cwd: workspaceRoot,
			maxBuffer: 1024 * 1024 * 10 // 10MB buffer
		});
		
		const { stdout: unstagedDiff } = await execAsync('git diff', { 
			cwd: workspaceRoot,
			maxBuffer: 1024 * 1024 * 10 // 10MB buffer
		});

		let combinedDiff = '';
		
		if (stagedDiff.trim()) {
			combinedDiff += '=== STAGED CHANGES ===\n' + stagedDiff + '\n';
		}
		
		if (unstagedDiff.trim()) {
			combinedDiff += '=== UNSTAGED CHANGES ===\n' + unstagedDiff;
		}

		return combinedDiff;
	} catch (error) {
		if (error instanceof Error && 'code' in error && error.code === 128) {
			throw new Error('Not a git repository');
		}
		throw error;
	}
}

// This method is called when your extension is deactivated
export function deactivate() {}
