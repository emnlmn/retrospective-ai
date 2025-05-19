'use server';

/**
 * @fileOverview Provides AI-powered suggestions for action items based on the content of the 'To Improve' column.
 *
 * - suggestActionItems - A function that generates action item suggestions.
 * - SuggestActionItemsInput - The input type for the suggestActionItems function.
 * - SuggestActionItemsOutput - The return type for the suggestActionItems function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestActionItemsInputSchema = z.object({
  toImproveColumnContent: z
    .string()
    .describe('The content of the \'To Improve\' column in the retrospective board.'),
});
export type SuggestActionItemsInput = z.infer<typeof SuggestActionItemsInputSchema>;

const SuggestActionItemsOutputSchema = z.object({
  actionItems: z
    .array(z.string())
    .describe('A list of suggested action items based on the \'To Improve\' column content.'),
});
export type SuggestActionItemsOutput = z.infer<typeof SuggestActionItemsOutputSchema>;

export async function suggestActionItems(input: SuggestActionItemsInput): Promise<SuggestActionItemsOutput> {
  return suggestActionItemsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestActionItemsPrompt',
  input: {schema: SuggestActionItemsInputSchema},
  output: {schema: SuggestActionItemsOutputSchema},
  prompt: `You are an AI assistant helping to generate action items for retrospective meetings.

  Based on the \'To Improve\' column content provided, suggest concrete and actionable steps.

  To Improve column content: {{{toImproveColumnContent}}}

  Please provide a list of action items that directly address the issues and improvements identified.
  The action items should be specific, measurable, achievable, relevant, and time-bound (SMART).
  Return the action items as a JSON array of strings.
  `,
});

const suggestActionItemsFlow = ai.defineFlow(
  {
    name: 'suggestActionItemsFlow',
    inputSchema: SuggestActionItemsInputSchema,
    outputSchema: SuggestActionItemsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
