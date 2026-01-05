type Thenable<T> = PromiseLike<T>;

export type TokenCounterModel = {
	readonly maxInputTokens: number;
	countTokens(text: string, token?: unknown): Thenable<number>;
};

export type BuildDiffReviewPromptResult = {
	prompt: string;
	wasTruncated: boolean;
};

const DEFAULT_SAFETY_RATIO = 0.85;
const DEFAULT_RESERVED_TOKENS = 256;
const DEFAULT_BUFFER_TOKENS = 64;

export function getPromptTokenBudget(maxInputTokens: number): number {
	if (!Number.isFinite(maxInputTokens) || maxInputTokens <= 0) {
		return 512;
	}

	const budget = Math.floor(maxInputTokens * DEFAULT_SAFETY_RATIO) - DEFAULT_RESERVED_TOKENS;
	return Math.min(maxInputTokens, Math.max(64, budget));
}

function renderPrompt(instruction: string, diff: string, truncationNote?: string): string {
	const noteBlock = truncationNote ? `${truncationNote}\n\n` : '';

	return `${instruction}\n\n${noteBlock}Here are the git changes:\n\n\`\`\`diff\n${diff}\n\`\`\``;
}

async function safeCountTokens(model: TokenCounterModel, text: string, token?: unknown): Promise<number | undefined> {
	try {
		return await Promise.resolve(model.countTokens(text, token));
	} catch {
		return undefined;
	}
}

function buildHeadTailExcerpt(text: string, keepChars: number): { excerpt: string; keepChars: number } {
	if (text.length <= keepChars) {
		return { excerpt: text, keepChars: text.length };
	}

	const keepStart = Math.max(0, Math.floor(keepChars * 0.7));
	const keepEnd = Math.max(0, keepChars - keepStart);

	if (keepEnd === 0) {
		return { excerpt: text.slice(0, keepStart), keepChars: keepStart };
	}

	const head = text.slice(0, keepStart);
	const tail = text.slice(Math.max(0, text.length - keepEnd));

	return {
		excerpt: `${head}\n\n... [TRUNCATED MIDDLE] ...\n\n${tail}`,
		keepChars,
	};
}

export async function buildDiffReviewPromptWithinBudget(args: {
	model: TokenCounterModel;
	instruction: string;
	diff: string;
	token?: unknown;
}): Promise<BuildDiffReviewPromptResult> {
	const { model, instruction, diff, token } = args;
	const promptBudget = getPromptTokenBudget(model.maxInputTokens);

	const fullPrompt = renderPrompt(instruction, diff);
	const fullTokens = await safeCountTokens(model, fullPrompt, token);
	if (fullTokens !== undefined && fullTokens <= promptBudget) {
		return { prompt: fullPrompt, wasTruncated: false };
	}

	const basePrompt = renderPrompt(instruction, '');
	const baseTokens = (await safeCountTokens(model, basePrompt, token)) ?? 0;
	const availableTokensForDiff = Math.max(0, promptBudget - baseTokens - DEFAULT_BUFFER_TOKENS);

	if (availableTokensForDiff === 0) {
		return {
			prompt: renderPrompt(
				instruction,
				'',
				'NOTE: The diff was too large to include within the model token budget.'
			),
			wasTruncated: true,
		};
	}

	const diffTokens = await safeCountTokens(model, diff, token);

	let keepChars: number;
	if (diffTokens === undefined || diffTokens <= 0) {
		keepChars = Math.min(diff.length, availableTokensForDiff * 4);
	} else {
		const keepFraction = Math.min(1, availableTokensForDiff / diffTokens);
		keepChars = Math.max(0, Math.floor(diff.length * keepFraction));
	}

	const truncationNote = `NOTE: Diff truncated to fit model token budget (~${availableTokensForDiff} tokens available for diff).`;

	for (let attempt = 0; attempt < 6; attempt++) {
		const { excerpt, keepChars: usedChars } = buildHeadTailExcerpt(diff, keepChars);
		const candidate = renderPrompt(instruction, excerpt, truncationNote);
		const candidateTokens = await safeCountTokens(model, candidate, token);

		if (candidateTokens === undefined) {
			return { prompt: candidate, wasTruncated: true };
		}

		if (candidateTokens <= promptBudget) {
			return { prompt: candidate, wasTruncated: usedChars < diff.length };
		}

		keepChars = Math.floor(keepChars * 0.85);
		if (keepChars < 200) {
			break;
		}
	}

	return {
		prompt: renderPrompt(
			instruction,
			'',
			'NOTE: The diff was too large to include within the model token budget.'
		),
		wasTruncated: true,
	};
}
