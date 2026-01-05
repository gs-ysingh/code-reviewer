import * as assert from 'assert';
import { buildDiffReviewPromptWithinBudget, getPromptTokenBudget } from '../promptBudget';

type FakeModel = {
	maxInputTokens: number;
	countTokens(text: string): Promise<number>;
};

suite('Prompt Budget', () => {
	test('Does not truncate small diffs', async () => {
		const model: FakeModel = {
			maxInputTokens: 2000,
			countTokens: async (text: string) => Math.ceil(text.length / 4),
		};

		const result = await buildDiffReviewPromptWithinBudget({
			model,
			instruction: 'Review this diff.',
			diff: 'diff --git a/a.txt b/a.txt\n+hello\n',
		});

		assert.strictEqual(result.wasTruncated, false);
	});

	test('Truncates large diffs to fit budget', async () => {
		const model: FakeModel = {
			maxInputTokens: 500,
			countTokens: async (text: string) => Math.ceil(text.length / 4),
		};

		const hugeDiff = 'diff --git a/a.txt b/a.txt\n' + 'a'.repeat(50_000);
		const result = await buildDiffReviewPromptWithinBudget({
			model,
			instruction: 'Review this diff.',
			diff: hugeDiff,
		});

		assert.strictEqual(result.wasTruncated, true);

		const budget = getPromptTokenBudget(model.maxInputTokens);
		const tokens = await model.countTokens(result.prompt);
		assert.ok(tokens <= budget, `expected tokens (${tokens}) <= budget (${budget})`);
		assert.ok(result.prompt.includes('TRUNCATED'), 'expected truncation marker');
	});
});
