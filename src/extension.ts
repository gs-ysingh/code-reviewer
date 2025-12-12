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

		// Handle the "reviewBranch" command
		if (request.command === 'reviewBranch') {
			try {
				await handleReviewBranchCommand(request, context, stream, token);
			} catch (error) {
				stream.markdown(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
			}
			return;
		}

		// Default handler for general conversation
		stream.markdown('I can help you review your git changes! Use the `/review` command to analyze your local changes, or ask me questions about code quality and best practices.\n\n');
		stream.markdown('**Available commands:**\n');
		stream.markdown('- `/review` - Review all local git changes (staged and unstaged)\n');
		stream.markdown('- `/reviewBranch` - Review all changes in a git branch compared to another branch\n');
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

	// Register the command to trigger branch review from command palette
	const reviewBranchCommand = vscode.commands.registerCommand('code-review.reviewGitBranch', async () => {
		try {
			// Get workspace folder
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders || workspaceFolders.length === 0) {
				vscode.window.showErrorMessage('No workspace folder open. Please open a git repository first.');
				return;
			}

			const workspaceRoot = workspaceFolders[0].uri.fsPath;

			// Get list of branches
			const branches = await getBranches(workspaceRoot);
			
			if (branches.length === 0) {
				vscode.window.showErrorMessage('No git branches found in this repository.');
				return;
			}

			// Show quick pick for target branch
			const targetBranch = await vscode.window.showQuickPick(branches, {
				placeHolder: 'Select the branch to review'
			});

			if (!targetBranch) {
				return; // User cancelled
			}

			// Show quick pick for base branch
			const baseBranch = await vscode.window.showQuickPick(
				branches.filter(b => b !== targetBranch),
				{
					placeHolder: `Select the base branch to compare ${targetBranch} against`,
					title: 'Base Branch Selection'
				}
			);

			if (!baseBranch) {
				return; // User cancelled
			}

			// Open chat and send the reviewBranch command
			vscode.commands.executeCommand('workbench.action.chat.open', {
				query: `@code-reviewer /reviewBranch ${targetBranch} ${baseBranch}`
			});
		} catch (error) {
			vscode.window.showErrorMessage(`Branch review failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	});

	context.subscriptions.push(codeReviewer, reviewCommand, reviewBranchCommand);
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

async function handleReviewBranchCommand(request: vscode.ChatRequest, context: vscode.ChatContext, stream: vscode.ChatResponseStream, token: vscode.CancellationToken) {
	// Get workspace folder
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders || workspaceFolders.length === 0) {
		stream.markdown('❌ No workspace folder open. Please open a git repository first.');
		return;
	}

	const workspaceRoot = workspaceFolders[0].uri.fsPath;

	// Parse the prompt to get branch names
	const promptText = request.prompt.trim();
	const parts = promptText.split(/\s+/);
	
	let targetBranch: string | undefined;
	let baseBranch: string | undefined;

	if (parts.length >= 2) {
		targetBranch = parts[0];
		baseBranch = parts[1];
	} else if (parts.length === 1) {
		targetBranch = parts[0];
		// Default base branch to main or master
		try {
			const branches = await getBranches(workspaceRoot);
			baseBranch = branches.includes('main') ? 'main' : branches.includes('master') ? 'master' : undefined;
		} catch (error) {
			// Ignore error, will prompt user below
		}
	}

	// If branches not specified, prompt the user
	if (!targetBranch || !baseBranch) {
		stream.markdown('⚠️ Please specify the branches to compare.\n\n');
		stream.markdown('**Usage**: `/reviewBranch <target-branch> <base-branch>`\n\n');
		stream.markdown('**Example**: `/reviewBranch feature/new-feature main`\n\n');
		
		try {
			const branches = await getBranches(workspaceRoot);
			if (branches.length > 0) {
				stream.markdown('**Available branches**:\n');
				branches.forEach(branch => stream.markdown(`- ${branch}\n`));
			}
		} catch (error) {
			// Ignore error
		}
		return;
	}

	// Show progress
	stream.progress(`Fetching changes between ${baseBranch} and ${targetBranch}...`);

	// Get branch diff
	let branchDiff: string;
	try {
		branchDiff = await getBranchDiff(workspaceRoot, targetBranch, baseBranch);
	} catch (error) {
		stream.markdown(`❌ Error getting branch diff: ${error instanceof Error ? error.message : String(error)}\n\n`);
		stream.markdown(`Make sure both branches exist and are valid.`);
		return;
	}

	if (!branchDiff || branchDiff.trim().length === 0) {
		stream.markdown(`ℹ️ No differences found between \`${targetBranch}\` and \`${baseBranch}\`.`);
		return;
	}

	stream.progress('Analyzing branch changes with AI...');

	// Craft the prompt for code review
	const prompt = `You are an expert code reviewer. Please review the following git changes from branch "${targetBranch}" compared to "${baseBranch}" and provide:

1. **Summary**: A brief overview of what changed
2. **Potential Issues**: Any bugs, security concerns, or code quality problems
3. **Best Practices**: Suggestions for improvements following best practices
4. **Positive Feedback**: What was done well

Here are the git changes:

\`\`\`diff
${branchDiff}
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

async function getBranches(workspaceRoot: string): Promise<string[]> {
	try {
		const { stdout } = await execAsync('git branch --all --format="%(refname:short)"', {
			cwd: workspaceRoot
		});

		const branches = stdout
			.split('\n')
			.map(b => b.trim())
			.filter(b => b.length > 0)
			.filter(b => !b.startsWith('origin/HEAD'))
			.map(b => b.replace('origin/', ''))
			.filter((b, index, self) => self.indexOf(b) === index); // Remove duplicates

		return branches;
	} catch (error) {
		throw new Error('Failed to get git branches');
	}
}

async function getBranchDiff(workspaceRoot: string, targetBranch: string, baseBranch: string): Promise<string> {
	// Helper function to resolve branch name (check local, then remote)
	const resolveBranch = async (branch: string): Promise<string> => {
		try {
			// Try as-is first
			await execAsync(`git rev-parse --verify ${branch}`, { cwd: workspaceRoot });
			return branch;
		} catch {
			// Try with origin/ prefix if not already there
			if (!branch.startsWith('origin/')) {
				try {
					await execAsync(`git rev-parse --verify origin/${branch}`, { cwd: workspaceRoot });
					return `origin/${branch}`;
				} catch {
					// Branch doesn't exist locally or remotely
					throw new Error(`Branch '${branch}' not found`);
				}
			}
			throw new Error(`Branch '${branch}' not found`);
		}
	};

	try {
		// Resolve both branches
		const resolvedTarget = await resolveBranch(targetBranch);
		const resolvedBase = await resolveBranch(baseBranch);
		
		// Get the diff between branches
		const { stdout } = await execAsync(`git diff ${resolvedBase}...${resolvedTarget}`, {
			cwd: workspaceRoot,
			maxBuffer: 1024 * 1024 * 10 // 10MB buffer
		});

		return stdout;
	} catch (error) {
		if (error instanceof Error) {
			throw error;
		}
		throw new Error(`Unable to compare branches '${targetBranch}' and '${baseBranch}'`);
	}
}

// This method is called when your extension is deactivated
export function deactivate() {}
