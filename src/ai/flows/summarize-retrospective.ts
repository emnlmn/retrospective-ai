'use server';

/**
 * @fileOverview Summarizes the retrospective board.
 *
 * - summarizeRetrospective - A function that summarizes the retrospective board.
 * - SummarizeRetrospectiveInput - The input type for the summarizeRetrospective function.
 * - SummarizeRetrospectiveOutput - The return type for the summarizeRetrospective function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SummarizeRetrospectiveInputSchema = z.object({
  wentWell: z.array(z.string()).describe('A list of things that went well.'),
  toImprove: z.array(z.string()).describe('A list of things to improve.'),
  actionItems: z.array(z.string()).describe('A list of action items.'),
});

export type SummarizeRetrospectiveInput = z.infer<
  typeof SummarizeRetrospectiveInputSchema
>;

const SummarizeRetrospectiveOutputSchema = z.object({
  summary: z.string().describe('A summary of the retrospective board.'),
});

export type SummarizeRetrospectiveOutput = z.infer<
  typeof SummarizeRetrospectiveOutputSchema
>;

export async function summarizeRetrospective(
  input: SummarizeRetrospectiveInput
): Promise<SummarizeRetrospectiveOutput> {
  return summarizeRetrospectiveFlow(input);
}

const prompt = ai.definePrompt({
  name: 'summarizeRetrospectivePrompt',
  input: {schema: SummarizeRetrospectiveInputSchema},
  output: {schema: SummarizeRetrospectiveOutputSchema},
  prompt: `You are an expert facilitator summarizing retrospective meetings.

  Given the following information from the retrospective, generate a concise summary of the key takeaways.

  Went Well:
  {{#each wentWell}}- {{this}}\n{{/each}}

  To Improve:
  {{#each toImprove}}- {{this}}\n{{/each}}

  Action Items:
  {{#each actionItems}}- {{this}}\n{{/each}}

  Summary: `,
});

const summarizeRetrospectiveFlow = ai.defineFlow(
  {
    name: 'summarizeRetrospectiveFlow',
    inputSchema: SummarizeRetrospectiveInputSchema,
    outputSchema: SummarizeRetrospectiveOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
