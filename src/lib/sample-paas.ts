// Sample PAA questions for auto glass content
// Each question must include {location} as a placeholder

export const SAMPLE_PAAS = `How much should I expect to pay for a new windshield in {location}?
Is it illegal to drive with a cracked windshield in {location}?
How much on average does it cost to replace a windscreen in {location}?
How much does it cost to replace a windshield in {location}?
What is the best place to get your windshield replaced in {location}?
How much will my windshield replacement cost in {location}?
How much is it to replace a windshield in {location}?
Where is the best place to replace a windshield in {location}?
How can I save money on a windshield replacement in {location}?
Does {location} still replace windshields for free?
How much does it cost to replace your whole windshield in {location}?
Will insurance cover a new windshield in {location}?
How much to replace a windshield in {location}?
Is windshield replacement free in {location}?
What does the average windshield cost to replace in {location}?
Does {location} have free windshield replacement?
Why is glass repair so expensive in {location}?
How to temporarily fix a crack in {location}?
Can you fix a windshield crack without replacing it in {location}?
How much does it cost to fix a car window not going up in {location}?
Does {location} replace windshields for free?
Is it cheaper to replace the whole window or just the glass in {location}?
Does {location} do free windshield replacement?
Is it worth filing an insurance claim for a cracked windshield in {location}?
What does $500 deductible with full glass mean in {location}?
Will my insurance go up if I claim for a windshield in {location}?
Who is responsible if a rock hits your windshield in {location}?
Why won't insurance cover windshields in {location}?
Is a cracked windshield covered by my insurance in {location}?
Is it okay to drive with a cracked windshield in {location}?
What to do if a rock hits your windshield in {location}?
What does rubbing a potato on your windshield do in {location}?
Do I have to pay a deductible if a rock hits your windshield in {location}?
How urgent is a cracked windshield in {location}?
How can I get my windshield replaced for free in {location}?
Will insurance cover a cracked windshield in {location}?
Can I drive with a cracked windshield in {location}?
Is it illegal to have a cracked windshield in {location}?
Who pays when a rock hits your windshield in {location}?
How much is a cracked windshield ticket in {location}?
Is it worth filing a claim for a cracked windshield in {location}?
How much is windshield crack repair without insurance in {location}?
Can a police officer pull you over for a cracked windshield in {location}?
Can you pass a car inspection with a crack in your windshield in {location}?
Can you fix a crack in a glass window without replacing it in {location}?
What is the strongest crack filler in {location}?
What is the average cost to replace a windshield in {location}?
How much does ADAS calibration cost in {location}?
What is ADAS calibration and why is it needed in {location}?`

export function getSamplePAAsArray(): string[] {
  return SAMPLE_PAAS.split('\n').filter(line => line.trim().length > 0)
}
