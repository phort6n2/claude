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
What is ADAS calibration and why is it needed in {location}?
How long does windshield replacement take in {location}?
Can I drive immediately after windshield replacement in {location}?
What is the best windshield brand to use in {location}?
Does OEM glass matter for windshield replacement in {location}?
How long should I wait to wash my car after windshield replacement in {location}?
What causes windshield cracks to spread in {location}?
Can extreme heat crack a windshield in {location}?
Can cold weather crack a windshield in {location}?
How do I stop a windshield crack from spreading in {location}?
What size crack can be repaired in a windshield in {location}?
Is windshield repair or replacement better in {location}?
How much does rock chip repair cost in {location}?
Can a rock chip be repaired in {location}?
How many rock chips can be repaired on a windshield in {location}?
Does rock chip repair really work in {location}?
How long does rock chip repair last in {location}?
Can you repair a rock chip in cold weather in {location}?
What happens if you don't fix a rock chip in {location}?
How big of a chip can be repaired in {location}?
Does insurance cover rock chip repair in {location}?
How much does side window replacement cost in {location}?
How much does it cost to replace a car door window in {location}?
Can a broken car window be repaired in {location}?
How long does it take to replace a car side window in {location}?
Why is car side window replacement so expensive in {location}?
Does insurance cover broken car windows in {location}?
How much does rear window replacement cost in {location}?
Can a rear windshield be repaired in {location}?
How long does it take to replace a rear windshield in {location}?
Is rear window replacement covered by insurance in {location}?
How much does sunroof glass replacement cost in {location}?
Can a cracked sunroof be repaired in {location}?
How long does sunroof replacement take in {location}?
Does insurance cover sunroof damage in {location}?
What is mobile windshield replacement in {location}?
Do mobile auto glass services come to your home in {location}?
Is mobile windshield replacement as good as shop replacement in {location}?
How much does mobile windshield replacement cost in {location}?
Can windshield replacement be done in the rain in {location}?
What is the warranty on windshield replacement in {location}?
How do I know if my windshield was installed correctly in {location}?
What happens if my new windshield leaks in {location}?
Can a windshield be replaced same day in {location}?
Do I need to recalibrate my camera after windshield replacement in {location}?
What cars require ADAS calibration after windshield replacement in {location}?
How do I find a certified auto glass installer in {location}?
What is the difference between OEM and aftermarket windshields in {location}?
Should I tip my windshield installer in {location}?
How do I prepare my car for windshield replacement in {location}?
Can windshield replacement affect my car's safety in {location}?
What is the best time of year to replace a windshield in {location}?`

export function getSamplePAAsArray(): string[] {
  return SAMPLE_PAAS.split('\n').filter(line => line.trim().length > 0)
}
