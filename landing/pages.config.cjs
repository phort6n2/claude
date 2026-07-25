/* Page content for the HV Auto Glass Denver mini-site.
   Slugs match the existing site exactly so Google Ads final URLs keep working.
   Each page gets a unique title, meta description, H1, hero sub, a body
   section and its own FAQ — thin or duplicated pages hurt Ad Rank. */

const SERVICES = [
  ['windshield-replacement','Windshield replacement'],
  ['windshield-repair','Rock chip / crack repair'],
  ['auto-glass-repair','Not sure — help me decide'],
  ['auto-glass-replacement','Windshield replacement'],
  ['rock-chip-repair','Rock chip / crack repair'],
  ['windshield-chip-repair','Rock chip / crack repair'],
  ['windshield-crack-repair','Rock chip / crack repair'],
  ['car-window-repair','Door or side window'],
  ['car-window-replacement','Door or side window'],
  ['door-glass-repair','Door or side window'],
  ['back-glass-repair','Back glass'],
  ['adas-calibration','ADAS calibration'],
  ['mobile-service','Not sure — help me decide'],
  ['auto-insurance','Not sure — help me decide'],
];

const pages = [
{
  slug:'windshield-replacement',
  title:'Windshield Replacement in Denver — Often $0 With Insurance',
  desc:'Mobile windshield replacement across metro Denver. OEM-quality glass, ADAS recalibration in-house, same-day slots, lifetime workmanship warranty. Call (720) 232-0320.',
  eyebrow:'Windshield Replacement',
  h1:'Windshield replacement in Denver — <span class="hl">often $0 with insurance.</span>',
  sub:'Full replacement with OEM-quality glass, installed at your home or office and recalibrated for your car\'s safety cameras. Same-day and next-day slots across metro Denver.',
  svc:'Windshield replacement',
  intro:{
    heading:'When a windshield has to be replaced, not repaired',
    paras:[
      'A windshield is structural. It braces the roof in a rollover and it is the backstop your passenger airbag inflates against, so an installation that looks fine but was rushed is a genuine safety problem. That is why we bond every windshield with automotive urethane and give you a written safe drive-away time rather than handing the keys back immediately.',
      'Repair stops being an option once damage reaches the driver\'s primary line of sight, runs to the edge of the glass, or involves more than a couple of separate breaks. Damage at the edge matters more than most people expect — that is where the glass carries load, and a crack there tends to run.'
    ],
    bullets:[
      'OEM or OEM-equivalent glass matched to your VIN, including acoustic and heated variants',
      'Correct urethane for the temperature that day, with a stated safe drive-away time',
      'Rain sensors, cameras, humidity sensors and mirrors transferred and re-seated',
      'ADAS recalibration handled in-house — no second appointment somewhere else',
      'Old urethane trimmed back and the pinchweld inspected for rust before new glass goes in',
      'Lifetime workmanship warranty against leaks, wind noise and installation-related stress cracks'
    ]
  },
  faq:[
    ['How long does a windshield replacement take?','The replacement itself usually runs 60 to 90 minutes. If your vehicle needs ADAS calibration, add roughly another hour. The adhesive then needs time to cure — we give you a specific safe drive-away time before we leave.'],
    ['Can you replace it at my house in winter?','Usually yes. Urethane has a working temperature range, so in very cold or wet weather we may need a garage, a covered space, or to move the job into the shop. We will tell you honestly rather than install in conditions that compromise the bond.'],
    ['Will a new windshield leak or whistle?','Not if it is installed properly, and that is exactly what our lifetime workmanship warranty covers. If you notice water or wind noise after we work on your vehicle, call us and we will make it right at no charge.'],
    ['Do I need OEM glass?','Not always. OEM-equivalent glass is made to the same specifications and is what most insurers cover. If your vehicle has a camera, heads-up display or acoustic interlayer, we match those features exactly — that part is not optional.']
  ]
},
{
  slug:'windshield-repair',
  title:'Windshield Repair in Denver — Fast Chip & Crack Repair',
  desc:'Same-day windshield chip and crack repair across Denver. Most repairs take under 30 minutes and are often fully covered by insurance. Call (720) 232-0320.',
  eyebrow:'Windshield Repair',
  h1:'Windshield repair in Denver — <span class="hl">stop it before it spreads.</span>',
  sub:'Most chips and short cracks can be repaired in about 30 minutes, at your home or office. Far cheaper than replacement, and often covered in full by insurance.',
  svc:'Rock chip / crack repair',
  intro:{
    heading:'Repair is quicker, cheaper, and usually the right call first',
    paras:[
      'A repair injects resin into the break under vacuum and pressure, then cures it with UV light. That restores much of the glass strength and, more importantly, stops the damage travelling. Colorado is hard on windshields — gravel on I-70, sanded winter roads, and big overnight temperature swings that turn a harmless chip into a foot-long crack.',
      'Speed matters more than people realise. A fresh chip that is still clean repairs far better than one that has collected dust, wax and water for a month. If you can get to it in the first few days, the result is usually close to invisible.'
    ],
    bullets:[
      'Most repairs finished in 20 to 30 minutes, while you carry on with your day',
      'Chips up to roughly a quarter and cracks up to about six inches are usually repairable',
      'Keeps your factory glass and factory seal — no ADAS recalibration needed',
      'Many insurers waive the deductible entirely on repairs, because it is cheaper than replacing',
      'We tell you honestly if a repair will not hold and replacement is the safer option'
    ]
  },
  faq:[
    ['Will the chip disappear completely?','It will look substantially better, but a faint mark usually remains. The purpose of a repair is structural — stopping the crack from spreading — with appearance as a close second.'],
    ['Is a repair as strong as new glass?','A properly filled repair restores most of the strength in that area and prevents the break from running. If the damage is too large or badly placed for that to hold, we will recommend replacement rather than sell you a repair that fails.'],
    ['How long can I wait before repairing a chip?','Sooner is better. Dirt and moisture work into the break and reduce how well the resin bonds, and one cold night or a hot defroster can turn a repairable chip into a full replacement.'],
    ['Does a repair cost me anything?','Often nothing. Many carriers cover glass repair with no deductible because it saves them a replacement. Tell us your carrier and we will confirm before we do the work.']
  ]
},
{
  slug:'auto-glass-repair',
  title:'Auto Glass Repair in Denver — Mobile Service, We Come To You',
  desc:'Mobile auto glass repair across metro Denver: windshields, door glass, back glass and rock chips. Same-day service, lifetime warranty. Call (720) 232-0320.',
  eyebrow:'Auto Glass Repair',
  h1:'Auto glass repair in Denver — <span class="hl">repaired if we can, replaced if we must.</span>',
  sub:'Windshields, side windows, back glass and rock chips. Tell us what happened and we will tell you straight whether it needs a 30-minute repair or a full replacement.',
  svc:'Not sure — help me decide',
  intro:{
    heading:'One team for every piece of glass on the vehicle',
    paras:[
      'Not everything needs replacing. A chip caught early, a door glass that has come off its regulator, a rear defroster tab that has lifted — these are repairs, and repairs are faster and cheaper than a new panel of glass. The first thing we do is tell you which one you actually need.',
      'We work on all makes and models, from daily drivers to work trucks and heavy equipment. If you are not sure whether your damage is repairable, send a photo with your quote request and we will tell you before anyone comes out.'
    ],
    bullets:[
      'Windshield chips and cracks, filled and cured on site',
      'Door and side glass, including regulators and off-track windows',
      'Back glass and rear defroster connection issues',
      'Heavy equipment and commercial fleet glass',
      'Free mobile service anywhere in metro Denver — home, work or roadside',
      'Honest repair-or-replace advice before you commit to anything'
    ]
  },
  faq:[
    ['How do I know if it can be repaired?','As a rule of thumb: chips smaller than a quarter, cracks shorter than about six inches, and damage outside the driver\'s direct line of sight are usually repairable. Send a photo and we will give you a straight answer.'],
    ['Do you charge for mobile service?','No. Coming to you is how we normally work, and there is no extra charge for it anywhere in our service area.'],
    ['Can you work on my work truck or equipment?','Yes. We do commercial vehicles and heavy equipment as well as passenger cars. Tell us the machine and we will source the right glass.'],
    ['How soon can someone come out?','Most repairs can be scheduled same-day or next-day. Call us and we will give you the next real opening rather than a vague window.']
  ]
},
{
  slug:'auto-glass-replacement',
  title:'Auto Glass Replacement in Denver — Same-Day Mobile Service',
  desc:'Auto glass replacement in Denver for windshields, door glass and back glass. OEM-quality glass, mobile service, lifetime warranty. Call (720) 232-0320.',
  eyebrow:'Auto Glass Replacement',
  h1:'Auto glass replacement in Denver — <span class="hl">any glass on the vehicle.</span>',
  sub:'Windshields, door glass and back glass replaced with OEM-quality parts, at your home or office, usually the same or next day.',
  svc:'Windshield replacement',
  intro:{
    heading:'The right glass, fitted properly, the first time',
    paras:[
      'Modern vehicles make glass selection surprisingly specific. The same model year can take several different windshields depending on whether it has a heads-up display, a rain sensor, acoustic lamination, heating elements, or a forward-facing camera. Ordering by VIN is how we avoid the phone call where someone says the part does not fit.',
      'Fitting matters just as much. Old urethane is cut back to a thin, even bed rather than removed entirely, the pinchweld is checked for rust, and the new bead is laid to the correct height so the glass sits at the right depth. Shortcuts there are what cause leaks and wind noise months later.'
    ],
    bullets:[
      'Glass ordered against your VIN so features and options match exactly',
      'Windshields, front and rear door glass, quarter glass and back glass',
      'Tempered side and rear glass, including the broken-glass cleanup nobody enjoys',
      'ADAS recalibration performed in-house when the vehicle requires it',
      'Mobile installation at no extra cost, weather permitting',
      'Lifetime workmanship warranty for as long as you own the vehicle'
    ]
  },
  faq:[
    ['How long does the whole job take?','Around 60 to 90 minutes for most replacements, plus roughly an hour if ADAS calibration is required. We will give you a safe drive-away time before we leave.'],
    ['What about the broken glass in my car?','Tempered side and back glass shatters into thousands of small pieces. Cleaning that out of your door cavity, seats and carpet is part of the job, not an extra.'],
    ['Will insurance cover a replacement?','If you carry comprehensive coverage, usually yes — and in Colorado that often means no deductible. Tell us your carrier and we will confirm your out-of-pocket cost first.'],
    ['Do you use aftermarket glass?','We use OEM or OEM-equivalent glass built to the same standards. Where your vehicle needs a specific feature — camera bracket, HUD, acoustic layer — we match it exactly.']
  ]
},
{
  slug:'rock-chip-repair',
  title:'Rock Chip Repair in Denver — Fixed in About 30 Minutes',
  desc:'Rock chip repair across Denver, usually done in under 30 minutes and often covered in full by insurance. Mobile service. Call (720) 232-0320.',
  eyebrow:'Rock Chip Repair',
  h1:'Rock chip repair in Denver — <span class="hl">about 30 minutes.</span>',
  sub:'Caught a rock on I-25 or C-470? A fresh chip is quick and cheap to fix, and most insurers waive the deductible entirely.',
  svc:'Rock chip / crack repair',
  intro:{
    heading:'Colorado roads are unusually hard on windshields',
    paras:[
      'Between highway gravel, the sand and aggregate spread on winter roads, and construction traffic on the corridors around Denver, rock chips are close to unavoidable here. What is avoidable is the crack that follows — and that is usually caused by a temperature swing, not another impact.',
      'The classic Denver failure is a cold morning, an icy windshield, and a defroster on full. The inner surface expands while the outer stays frozen, and a chip that survived weeks suddenly runs across the glass. Once that happens you are buying a windshield instead of a repair.'
    ],
    bullets:[
      'Chips up to about the size of a quarter are typically repairable',
      'Bullseyes, star breaks, combination breaks and small pits',
      'Resin injected under vacuum, then UV cured to lock the break',
      'Keeps your factory glass and seal, so no ADAS recalibration is needed',
      'Frequently covered in full by insurance with no deductible',
      'Mobile — we come to your driveway or workplace at no extra charge'
    ]
  },
  faq:[
    ['How fast should I get a chip repaired?','Within a few days if you can. Dirt and moisture contaminate the break and weaken the resin bond, and one cold night with the defroster on can spread it beyond repair.'],
    ['Can I run the defroster with a chip in the glass?','Use it gently. Blasting heat onto frozen glass is the single most common way a small chip turns into a long crack. Warm the car gradually until the chip is fixed.'],
    ['How many chips can be repaired at once?','Several, if they are well separated. When breaks are clustered close together or there are many across the glass, the windshield is structurally compromised and replacement is the safer route.'],
    ['Will it be invisible afterwards?','Usually about 80 to 90 percent improved. A faint mark often remains — the point is that the damage stops spreading and the glass regains strength.']
  ]
},
{
  slug:'windshield-chip-repair',
  title:'Windshield Chip Repair in Denver — Same-Day, Often $0',
  desc:'Same-day windshield chip repair in Denver. Under 30 minutes, keeps your factory glass, and usually covered by insurance. Call (720) 232-0320.',
  eyebrow:'Windshield Chip Repair',
  h1:'Windshield chip repair in Denver — <span class="hl">quick, cheap, often free.</span>',
  sub:'A chip repaired today costs a fraction of a windshield replaced next month. Most take under 30 minutes and are covered in full by insurance.',
  svc:'Rock chip / crack repair',
  intro:{
    heading:'What the chip looks like tells us whether it will hold',
    paras:[
      'Chips are not all the same, and the shape matters. A bullseye is a clean circular break that fills predictably. A star break sends short legs outward and needs the resin worked into each one. A combination break has both, and half-moons and pits behave differently again. Knowing which you have determines how the repair is done and how well it will finish.',
      'Two things push a chip out of repairable territory regardless of shape: sitting in the driver\'s direct line of sight, where even a faint blemish is a distraction, and sitting close to the edge of the glass, where the windshield carries structural load and cracks tend to run.'
    ],
    bullets:[
      'Bullseye, star, combination, half-moon and pit damage',
      'Repair typically completed in 20 to 30 minutes',
      'Factory glass and factory seal retained — no recalibration required',
      'No deductible with most carriers on chip repairs',
      'We recommend replacement instead when a repair would not be safe'
    ]
  },
  faq:[
    ['Is chip repair worth it, or should I just replace?','If it is repairable, repair is clearly better: it is cheaper, quicker, keeps your original factory seal, and avoids ADAS recalibration entirely. Replacement is for damage that cannot safely be filled.'],
    ['Where on the glass can a chip not be repaired?','Directly in the driver\'s line of sight, and within roughly two inches of the edge. The first leaves a visual distraction, the second sits where the glass carries load.'],
    ['Does the repair come with a warranty?','Our workmanship is warranted. A repair is not a permanent restoration though — if the chip later spreads despite a correct repair, that is the nature of glass, and we will credit the repair toward a replacement.'],
    ['Can you come to my office?','Yes. Mobile service is free and most customers have us come to their workplace so they lose no time at all.']
  ]
},
{
  slug:'windshield-crack-repair',
  title:'Windshield Crack Repair in Denver — Repair or Replace?',
  desc:'Windshield crack repair in Denver. We repair short cracks and replace when it is not safe to fill. Honest advice, mobile service. Call (720) 232-0320.',
  eyebrow:'Windshield Crack Repair',
  h1:'Windshield crack repair in Denver — <span class="hl">before it runs across the glass.</span>',
  sub:'Short cracks can often be filled and stopped. Long ones, edge cracks and anything in your line of sight need replacing — and we will tell you which you have.',
  svc:'Rock chip / crack repair',
  intro:{
    heading:'Length, location and age decide it',
    paras:[
      'Cracks are less forgiving than chips. A single clean crack up to roughly six inches, away from the edge and outside the driver\'s view, can usually be filled and stabilised. Beyond that, resin cannot restore enough strength to be trusted in a windshield that also braces your roof and backs your passenger airbag.',
      'Edge cracks are the ones to take seriously. The perimeter is where the glass is bonded and loaded, so a crack that reaches it will keep running with every pothole, door slam and cold morning. Those get replaced, not repaired.'
    ],
    bullets:[
      'Single cracks up to about six inches are often repairable',
      'Long cracks, branching cracks and edge cracks need replacement',
      'Anything in the driver\'s primary view is a replacement, not a repair',
      'Same-day and next-day replacement slots when repair is not viable',
      'ADAS recalibration included in-house when your vehicle needs it'
    ]
  },
  faq:[
    ['Is it illegal to drive with a cracked windshield in Colorado?','Colorado requires a windshield that does not obstruct the driver\'s clear view. A crack across your line of sight can absolutely draw a citation, and beyond the ticket it is a genuine safety and visibility problem.'],
    ['Will a crack keep spreading?','Almost always. Temperature swings, rough roads and even closing a door flex the glass. Denver\'s overnight temperature range is particularly good at turning a stable-looking crack into a full-width one.'],
    ['Can you repair a crack that reaches the edge?','No, and we would not try. The edge is where the windshield is bonded and carries load. Edge cracks need replacement.'],
    ['What if the crack is longer than six inches?','Then it is a replacement. We will confirm your insurance coverage first — in Colorado a comprehensive policy often covers it with no deductible.']
  ]
},
{
  slug:'car-window-repair',
  title:'Car Window Repair in Denver — Side & Door Glass',
  desc:'Car window repair in Denver for side and door glass, off-track windows and failed regulators. Mobile service, same-day. Call (720) 232-0320.',
  eyebrow:'Car Window Repair',
  h1:'Car window repair in Denver — <span class="hl">including the mechanism.</span>',
  sub:'Window stuck, dropped into the door, or off its track? Often the glass is fine and the regulator has failed — which is a cheaper fix.',
  svc:'Door or side window',
  intro:{
    heading:'A window that will not move is not always broken glass',
    paras:[
      'When a window drops into the door or refuses to move, the glass itself is frequently intact. The usual culprit is the regulator — the scissor or cable mechanism that raises and lowers it — or the motor that drives it. Cables fray, plastic clips break, and the glass simply lets go.',
      'That is worth knowing before you agree to pay for new glass. We take the door panel off, find out what actually failed, and quote the real repair. If the glass is fine, you should not be buying glass.'
    ],
    bullets:[
      'Off-track windows re-seated and re-secured',
      'Window regulator and motor replacement',
      'Broken clips and frayed regulator cables',
      'Tempered side glass replacement when the glass is genuinely broken',
      'Full cleanup of shattered glass from the door cavity and interior',
      'Weatherstripping and run channel issues that cause wind noise or leaks'
    ]
  },
  faq:[
    ['My window fell into the door — is the glass broken?','Often not. That symptom usually points to a failed regulator or broken clips letting go of otherwise intact glass. We will diagnose before quoting.'],
    ['Can you get all the broken glass out of the door?','Yes. Tempered glass shatters into thousands of small cubes that collect in the door cavity, seat rails and carpet. Removing it properly is part of the job.'],
    ['Can this be done at my house?','Yes, door glass work is well suited to mobile service. We just need safe, legal space to open the door fully and work beside the vehicle.'],
    ['How quickly can you get the part?','Common side glass and regulators are usually available same or next day. Rarer vehicles may take longer and we will tell you upfront.']
  ]
},
{
  slug:'car-window-replacement',
  title:'Car Window Replacement in Denver — Mobile, Same-Day',
  desc:'Car window replacement in Denver for side, quarter and door glass. Full glass cleanup included, mobile service. Call (720) 232-0320.',
  eyebrow:'Car Window Replacement',
  h1:'Car window replacement in Denver — <span class="hl">glass, cleanup and all.</span>',
  sub:'Side, quarter and door glass replaced at your home or office, with every last piece of shattered tempered glass cleaned out.',
  svc:'Door or side window',
  intro:{
    heading:'Side glass behaves nothing like a windshield',
    paras:[
      'Windshields are laminated — two layers of glass bonded to a plastic interlayer, which is why they crack and hold together rather than falling apart. Side and rear windows are tempered, designed to shatter into thousands of small blunt cubes so they are far less dangerous in a collision or a break-in.',
      'The practical consequence is that side glass never gets repaired, only replaced, and the job is as much about cleanup as installation. Those cubes get into the door cavity, the seat rails, the carpet and the door speaker. Leaving them there means rattles and glass surfacing for months.'
    ],
    bullets:[
      'Front and rear door glass, quarter glass and vent glass',
      'Tinted, privacy, laminated and acoustic side glass matched to your vehicle',
      'Thorough vacuum-out of the door cavity and interior',
      'Regulator and clip inspection while the door panel is off',
      'Same-day and next-day service on common vehicles',
      'Break-in damage handled quickly so the vehicle is secure again'
    ]
  },
  faq:[
    ['Why can side windows not be repaired?','They are tempered, so they shatter completely by design instead of cracking. There is nothing left to fill or bond, which is why replacement is the only option.'],
    ['Can you secure my car today if I cannot get glass right away?','Yes. If the exact glass has to be ordered, we can temporarily seal the opening so the vehicle stays weather-tight and secure until we return.'],
    ['Is a break-in covered by insurance?','Usually yes, under comprehensive coverage. Deductibles vary more on side glass than on windshields, so it is worth checking whether the claim is worth filing — we will help you work that out.'],
    ['Will the new glass match my tint?','Factory-tinted glass is matched to your vehicle. If you have aftermarket film applied over the glass, that film is destroyed with the old window and needs re-applying by a tint shop.']
  ]
},
{
  slug:'door-glass-repair',
  title:'Door Glass Repair in Denver — Side Windows & Regulators',
  desc:'Door glass repair and replacement in Denver, including regulators and off-track windows. Mobile service across metro Denver. Call (720) 232-0320.',
  eyebrow:'Door Glass Repair',
  h1:'Door glass repair in Denver — <span class="hl">at your driveway.</span>',
  sub:'Broken, stuck or dropped door glass repaired or replaced on site, with the regulator checked while the panel is off.',
  svc:'Door or side window',
  intro:{
    heading:'What is actually inside a car door',
    paras:[
      'A door is a surprisingly busy space: the glass, the regulator that moves it, a motor, run channels that guide it, a vapour barrier that keeps water out of the cabin, and usually a speaker and wiring. A fault in any of those shows up as a window that will not behave.',
      'Because the panel has to come off anyway, it is worth doing the rest properly while we are in there — checking the regulator, the clips and the run channels, and re-sealing the vapour barrier. Skipping the barrier is a common shortcut and it is why some cars come back with damp carpet and a musty smell.'
    ],
    bullets:[
      'Door glass replacement on all makes and models',
      'Regulator, motor, cable and clip repair',
      'Run channel and weatherstrip issues causing wind noise or water leaks',
      'Vapour barrier correctly re-sealed so water stays out of the cabin',
      'Complete removal of shattered tempered glass from the door',
      'Mobile service at no extra cost'
    ]
  },
  faq:[
    ['My window works but rattles or whistles — can you fix that?','Usually. That is typically a worn run channel, a loose clip, or degraded weatherstripping rather than the glass itself, and it is a straightforward fix.'],
    ['Do you need to remove the door panel?','Yes, for nearly all door glass work. We remove and refit it carefully — clips and trim can be brittle on older vehicles and we replace any that break.'],
    ['How long does door glass take?','Typically 60 to 90 minutes depending on the vehicle and whether the regulator also needs replacing.'],
    ['Can water get in before I get it fixed?','If the glass is gone, yes. Tell us and we can seal the opening temporarily so the interior stays dry and the vehicle stays secure.']
  ]
},
{
  slug:'back-glass-repair',
  title:'Back Glass Replacement in Denver — Rear Windshield Repair',
  desc:'Back glass and rear windshield replacement in Denver, including defroster grid connections. Mobile service, full cleanup. Call (720) 232-0320.',
  eyebrow:'Back Glass',
  h1:'Back glass replacement in Denver — <span class="hl">defroster and all.</span>',
  sub:'Rear windshields replaced with the defroster grid connected properly and every piece of shattered glass cleaned out of the cargo area.',
  svc:'Back glass',
  intro:{
    heading:'Rear glass is the fiddly one',
    paras:[
      'Back glass is usually tempered, so when it fails it goes all at once — typically across the parcel shelf, the rear seats and deep into the trunk. It also carries more built-in equipment than any other window: the defroster grid, often the radio antenna, sometimes a third brake light, wiper motor or camera.',
      'The connections are what separate a good job from a bad one. Defroster tabs are soldered or bonded to the grid, and if they are rushed the rear defroster works intermittently or not at all — something you generally do not discover until the first cold morning weeks later.'
    ],
    bullets:[
      'Rear windshield replacement for cars, SUVs and trucks',
      'Defroster grid connections made properly and tested',
      'Antenna, brake light and rear wiper components transferred',
      'Heated, tinted and privacy glass matched to your vehicle',
      'Thorough cleanup of the trunk, parcel shelf and rear seats',
      'Sliding rear window replacement for pickups'
    ]
  },
  faq:[
    ['Does the rear defroster still work afterwards?','Yes — reconnecting the defroster grid correctly is part of the job, and we test it before we leave. If it does not work, that is a workmanship issue and we will come back.'],
    ['How much glass ends up inside the car?','A lot. Tempered glass breaks into thousands of cubes that spread through the trunk, seats and parcel shelf. Cleaning it out thoroughly is included, not extra.'],
    ['Can back glass be repaired instead of replaced?','No. Tempered glass shatters completely rather than cracking, so there is nothing to repair. Replacement is the only route.'],
    ['My rear wiper is attached to the glass — is that a problem?','No. We transfer the wiper, brake light, antenna connections and any camera to the new glass as part of the installation.']
  ]
},
{
  slug:'adas-calibration',
  title:'ADAS Calibration in Denver — Done In-House After Replacement',
  desc:'ADAS windshield camera calibration in Denver. Lane keep, auto-brake and adaptive cruise recalibrated in-house after replacement. Call (720) 232-0320.',
  eyebrow:'ADAS Calibration',
  h1:'ADAS calibration in Denver — <span class="hl">done in-house, same visit.</span>',
  sub:'New windshield? Your lane-keep and automatic braking cameras have to be recalibrated. We do it ourselves, so there is no second appointment elsewhere.',
  svc:'ADAS calibration',
  intro:{
    heading:'Why a new windshield means recalibration',
    paras:[
      'If your vehicle has lane departure warning, automatic emergency braking, adaptive cruise control or a lane-centring assist, there is a forward-facing camera mounted to the windshield behind the mirror. That camera was aimed at the factory to a fraction of a degree, and its aim is referenced to the exact glass it was calibrated against.',
      'Replace the windshield and the camera sits on new glass at a marginally different angle and thickness. It still powers up and still looks like it works, which is precisely the danger — a camera aimed slightly low or high misjudges distance, and a system that brakes for you is now working from bad information.'
    ],
    bullets:[
      'Static calibration using manufacturer targets at measured distances',
      'Dynamic calibration performed on the road where the vehicle requires it',
      'Both procedures combined when the manufacturer specifies it',
      'Lane departure, lane keeping, automatic emergency braking and adaptive cruise',
      'Handled in-house — no separate trip to a dealership',
      'Confirmation that systems report ready before we hand the vehicle back'
    ]
  },
  faq:[
    ['How do I know if my vehicle needs calibration?','If it has lane-keep assist, automatic braking or adaptive cruise, it almost certainly does. Most vehicles from roughly 2018 onward have at least one. Give us your year, make and model and we will confirm.'],
    ['What happens if I skip it?','The systems may still appear active while aiming incorrectly — braking late, drifting in a lane, or misreading distance. Some vehicles throw a fault light; many do not, which is what makes skipping it risky.'],
    ['How much longer does calibration take?','Usually around an hour on top of the replacement. Static calibration needs level ground and controlled space; dynamic calibration needs a road drive at a steady speed.'],
    ['Is calibration covered by insurance?','Generally yes, when it is required as part of a covered windshield replacement. We include it in the claim we file for you.']
  ]
},
{
  slug:'mobile-service',
  title:'Mobile Auto Glass in Denver — We Come To You, Free',
  desc:'Free mobile auto glass service across metro Denver. We replace and repair glass at your home, office or roadside. Same-day slots. Call (720) 232-0320.',
  eyebrow:'Mobile Service',
  h1:'Mobile auto glass in Denver — <span class="hl">we come to you, free.</span>',
  sub:'Home, office or roadside anywhere in metro Denver. Same technicians, same warranty, same glass — you just skip the waiting room.',
  svc:'Not sure — help me decide',
  intro:{
    heading:'What we need from you, and what we bring',
    paras:[
      'Mobile is how we normally work rather than a premium add-on, so there is no extra charge for it. We bring the glass, the urethane, the tools and the calibration equipment to wherever the vehicle is parked, and most customers carry on working while we do the job.',
      'All we need is somewhere safe and legal to work: reasonably level ground, room to open the doors fully and walk around the vehicle, and shelter from rain or snow if the weather has turned. A driveway, a workplace car park or a residential street usually works fine.'
    ],
    bullets:[
      'Free mobile service anywhere in metro Denver',
      'Home, workplace, apartment car park or roadside',
      'Same lifetime workmanship warranty as work done in the shop',
      'ADAS calibration performed on site where the vehicle allows it',
      'Insurance claim filed for you before we arrive',
      'In-shop appointments available when weather or the job calls for it'
    ]
  },
  faq:[
    ['Do I have to be there the whole time?','No. Most customers hand over the keys and carry on with their day. We just need access to the vehicle and a way to reach you when we are done.'],
    ['What happens if it rains or snows?','Urethane needs dry conditions and a workable temperature to bond correctly. If the weather turns, we will reschedule or move you into the shop rather than install a windshield that will leak.'],
    ['Can you work in an apartment or underground car park?','Usually yes, if there is space to open the doors fully and the ceiling is high enough. Underground parking is often ideal in bad weather. Tell us the setup when you book.'],
    ['Is mobile service more expensive?','No. It is our standard way of working and there is no surcharge within our service area.']
  ]
},
{
  slug:'auto-insurance',
  title:'Auto Glass Insurance Claims in Denver — Often $0 Deductible',
  desc:'We file your Colorado auto glass insurance claim for you. Comprehensive coverage often means $0 out of pocket for windshield replacement. Call (720) 232-0320.',
  eyebrow:'Insurance Claims',
  h1:'Auto glass insurance claims — <span class="hl">we file it, you pay $0.</span>',
  sub:'Colorado is one of the better states for glass coverage. If you carry comprehensive, your windshield is often replaced with no deductible — and we handle the paperwork.',
  svc:'Not sure — help me decide',
  intro:{
    heading:'How glass coverage actually works in Colorado',
    paras:[
      'Windshield damage is covered under the comprehensive part of your policy, not collision, because it is not caused by an at-fault accident. Many Colorado carriers waive the deductible on glass — sometimes on replacement, very often on repair — which is why so many drivers here pay nothing at all.',
      'Two things people worry about, worth answering plainly. First, glass claims are typically no-fault and do not affect your record the way an at-fault accident does. Second, you choose the shop. An insurer may recommend one, but you are entitled to pick who does the work.'
    ],
    bullets:[
      'We contact your carrier and file the claim on your behalf',
      'Your out-of-pocket cost confirmed before any work begins',
      'We bill all major carriers direct — no reimbursement paperwork for you',
      'Repairs are frequently covered in full with no deductible',
      'ADAS calibration included in the claim when your vehicle requires it',
      'No-insurance and cash pricing available if you would rather not file'
    ]
  },
  faq:[
    ['Will filing a glass claim raise my premium?','In most cases no. Comprehensive glass claims are generally treated as no-fault and are not weighted like an at-fault accident. Individual carriers vary, so we will walk you through what your policy says before you commit.'],
    ['Do I really pay nothing?','Often, yes — if you carry comprehensive coverage. It depends on your specific policy, so we confirm your exact out-of-pocket cost with your carrier before we start, rather than promising a number we cannot see.'],
    ['Can my insurer make me use their shop?','No. They may suggest a network shop, but under Colorado law the choice of who repairs your vehicle is yours. We bill the major carriers directly, so using us costs you nothing extra.'],
    ['What if I do not have comprehensive coverage?','Then it is a cash job, and we will give you a straight price upfront. Repairs in particular are inexpensive enough that many customers skip the claim entirely.']
  ]
},
];

// ---- City pages -------------------------------------------------------
// Each city page is written from scratch rather than generated from one
// template with the name swapped in. Near-identical location pages read as
// doorway pages to Google, which is both a spam-policy problem and a drag on
// the landing page experience half of Quality Score. Every field below —
// headline, body, bullets and FAQ — is specific to that city.
const cityPages = [
{
  slug:'auto-glass-repair-aurora', city:'Aurora',
  title:'Aurora Auto Glass Repair — Mobile Windshield Service, CO',
  desc:'Mobile windshield repair and replacement across Aurora, from Southlands to Anschutz. ADAS recalibration in-house, often $0 with comprehensive. Call (720) 232-0320.',
  h1:'Aurora auto glass repair — <span class="hl">booked around your shift.</span>',
  sub:'Mobile windshield replacement, chip repair and ADAS calibration anywhere in Aurora. We work around Buckley and Anschutz schedules, so the van comes to you rather than the other way round.',
  heading:'Aurora: high mileage, newer cars, and a lot of highway gravel',
  paras:[
    'Aurora is the largest service area we cover outside Denver proper, and it generates more rock chips than anywhere else on our schedule. The reason is simple mileage — I-225, the Havana corridor and the long E-470 commutes mean Aurora drivers rack up highway miles at speed, and highway miles are where windshield damage comes from. A stone thrown at 65mph does damage a parking lot never will.',
    'It is also a newer fleet than most of the metro. A large share of the vehicles we see in Aurora carry a forward-facing camera behind the mirror for lane keeping and automatic emergency braking, which means the windshield cannot simply be swapped and handed back. The camera has to be recalibrated to the new glass or the safety systems aim at the wrong place. We do that ourselves rather than sending you on to a dealership.',
    'The other thing that shapes how we schedule Aurora is shift work. Between Buckley Space Force Base and the Anschutz Medical Campus, a lot of our Aurora customers are not free between nine and five. Mobile service solves that — we meet the car in the driveway or the staff car park while you are inside.'
  ],
  bullets:[
    'Free mobile service across all of Aurora — home, workplace or roadside',
    'Southlands, Saddle Rock, Aurora Hills, Del Mar, Green Valley Ranch and the I-225 corridor',
    'On-site calibration for lane-keeping and emergency-braking cameras',
    'We can work at Buckley and Anschutz car parks while you are on shift',
    'Chips caught early are usually a 30-minute repair, not a replacement',
    'Claim filed with your carrier before we arrive — often $0 in Colorado'
  ],
  faq:[
    ['Do you charge extra to come out to Aurora?','No. Aurora is inside our standard service area, so mobile service is free — the same as it is in Denver. There is no mileage surcharge for Southlands or the far east side.'],
    ['My car has lane assist. Can you calibrate it in Aurora, or do I need a dealership?','We calibrate it ourselves, and for many vehicles we can do it on site in Aurora. Some models require a level floor and a controlled target distance — if yours is one of them we will bring it into the shop and hand it back the same day rather than sending you to a dealer.'],
    ['Can you come to Buckley or the Anschutz campus?','Yes, and we do regularly. We need to be able to reach the vehicle and park alongside it. Tell us the lot and any gate or badge requirement when you book so we are not held up at the entrance.'],
    ['I got a chip on I-225 this morning. How long can I leave it?','Not long, especially in winter. A fresh chip is clean and repairs almost invisibly; one that has collected a week of road grime and been through a few freezing nights and hot defroster cycles often will not hold a repair. Same-day is genuinely better than next-week here.']
  ]
},
{
  slug:'auto-glass-repair-lakewood', city:'Lakewood',
  title:'Lakewood Auto Glass Repair — Mobile Windshield Service, CO',
  desc:'Mobile windshield replacement and chip repair throughout Lakewood, Belmar and Green Mountain. Mountain-road gravel damage a speciality. Call (720) 232-0320.',
  h1:'Lakewood auto glass repair — <span class="hl">mountain-road damage handled.</span>',
  sub:'Windshield replacement, chip and crack repair and ADAS calibration across Lakewood. If your glass picked up damage on a run up US 6 or I-70, this is the page you want.',
  heading:'Lakewood sits at the bottom of the canyon roads, and it shows',
  paras:[
    'Almost every Lakewood customer we see has the same story: the chip did not happen in town. US 6 up Clear Creek Canyon, I-70 towards the tunnel, and the C-470 climb are three of the most reliable windshield-wreckers in Colorado. They combine high speed, coarse road surface and, for half the year, a heavy layer of traction sand that trucks throw straight into the car behind.',
    'That pattern changes what we recommend. Canyon-road damage tends to be multiple small impacts rather than one big one, and it is often out at the edge of the glass where you barely notice it. Edge damage matters more than most drivers expect — the perimeter is where the windshield carries structural load, so a crack that starts there is the one most likely to run right across the screen on the first cold night.',
    'We cover the whole of Lakewood daily, from Belmar and the Union Boulevard offices out to Green Mountain and the West Colfax industrial stretch. Because we are based just up Sheridan, Lakewood is a short run for us and we can usually fit an appointment in without pushing you into next week.'
  ],
  bullets:[
    'Free mobile service throughout Lakewood — no travel charge',
    'Belmar, Green Mountain, Union Square, Applewood, Glennon Heights and the 6th Avenue corridor',
    'Multiple-chip repairs from canyon and I-70 gravel in a single visit',
    'Edge-crack assessment — we tell you honestly when a repair will not hold',
    'A short drive from our Sheridan Boulevard shop, so earlier slots are realistic',
    'Federal Center and Union Boulevard workplace visits welcome'
  ],
  faq:[
    ['I picked up several chips driving up I-70. Can they all be repaired at once?','Usually, yes. We can fill several separate impacts in one visit, and it is far cheaper than a replacement. The limits are how large each one is and how close together they sit — a cluster of breaks in the same area weakens the glass enough that replacement becomes the safer call. We will tell you which you are looking at before we start.'],
    ['There is a crack near the edge of my windshield. Is that different?','Yes, and it is worth taking seriously. The edge of the glass is where it carries load, so cracks that start there tend to spread — often overnight when the temperature drops. Edge damage is also the case where a repair is least likely to hold, so it is usually a replacement.'],
    ['Do you cover Green Mountain and Applewood?','Both, along with the rest of Lakewood. There is no travel surcharge anywhere in the city, and Lakewood is close enough to our shop that we can often get to you sooner than a same-day quote elsewhere in the metro.'],
    ['Can you replace glass at the Federal Center or a Union Boulevard office?','Yes — workplace visits are how a lot of our Lakewood jobs run. We need somewhere legal to park alongside the vehicle with room to open the doors. If the lot needs a badge or a visitor pass, let us know when booking.']
  ]
},
{
  slug:'auto-glass-repair-arvada', city:'Arvada',
  title:'Arvada Auto Glass Repair — Mobile Windshield Service, CO',
  desc:'Mobile windshield repair and replacement in Arvada, from Olde Town to Candelas. Winter sand damage, ADAS calibration, direct insurance billing. Call (720) 232-0320.',
  h1:'Arvada auto glass repair — <span class="hl">no Olde Town parking hunt.</span>',
  sub:'Windshield replacement, chip repair and ADAS recalibration throughout Arvada. We come to your driveway, which beats finding somewhere to leave the car for half a day.',
  heading:'Winter sand off the northwest roads is Arvada\'s main problem',
  paras:[
    'Arvada takes the brunt of the winter road treatment coming down from the northwest, and traction sand is brutal on glass. Wadsworth, Indiana Street and the Highway 93 approach get sanded heavily and stay sanded for days after the snow has gone, so the chip season here runs long past the last storm. If you drive Arvada in February you will collect chips — the only question is whether you catch them while they are still repairable.',
    'The newer end of the city changes the job as well. Candelas, Leyden Rock and West Woods are full of recent-model vehicles, and recent-model means a camera behind the mirror driving lane keeping and automatic braking. Those cameras have to be recalibrated when the glass changes. We do it in-house, which is the difference between one appointment and two.',
    'And there is a practical reason mobile suits Arvada specifically: parking. Olde Town and the older grid around Ralston Road are not places you want to leave a car all day waiting on a glass shop. We come to the house, the drive or the workplace, do the job there, and you never move the vehicle.'
  ],
  bullets:[
    'Free mobile service across Arvada — Olde Town to the Jefferson County line',
    'Olde Town, Candelas, Leyden Rock, West Woods, Ralston Valley and the Wadsworth corridor',
    'Winter sand chip repair — several impacts filled in one visit',
    'ADAS camera recalibration in-house, so it stays a single appointment',
    'No need to find all-day parking or give up the car for a shop visit',
    'Insurance handled for you, frequently with no deductible on repairs'
  ],
  faq:[
    ['Why do I keep getting chips in winter here?','Traction sand. The roads on Arvada\'s northwest side are sanded hard and stay gritty long after the snow clears, and every vehicle in front of you throws that grit backwards. It is the single most common cause of the damage we repair in Arvada, and it is why we suggest getting chips filled through the winter rather than waiting for spring.'],
    ['My street in Olde Town is narrow. Can you still work there?','Usually. What we need is room to open the doors fully and walk around the vehicle, plus somewhere legal to park the van nearby. If the street is genuinely too tight we can meet you at a nearby lot or bring the car into the shop — tell us the address when you book and we will flag it in advance.'],
    ['I have a newer car in Candelas with lane assist. Is calibration extra?','Calibration is a separate operation but we do it ourselves in the same visit, so it does not cost you a second appointment or a dealership trip. If your insurance is covering the replacement, the calibration is normally included in that claim — we will confirm before we start.'],
    ['How far into Arvada do you go?','All of it, out to the Jefferson County boundary, and there is no mileage charge anywhere in the city. Candelas and Leyden Rock are as covered as Olde Town.']
  ]
},
{
  slug:'auto-glass-repair-thornton', city:'Thornton',
  title:'Thornton Auto Glass Repair — Mobile Windshield Service, CO',
  desc:'Mobile windshield replacement and rock chip repair in Thornton, CO. I-25 commuter damage, ADAS calibration in-house, direct insurance billing. Call (720) 232-0320.',
  h1:'Thornton auto glass repair — <span class="hl">without the drive south.</span>',
  sub:'Mobile windshield replacement, chip repair and ADAS calibration throughout Thornton. We drive to you, so a rock chip does not cost you an afternoon on I-25.',
  heading:'The I-25 commute is what puts Thornton windshields in front of us',
  paras:[
    'Thornton is a commuter city, and the commute is the problem. The northern stretch of I-25 has been under near-continuous widening and resurfacing work for years, which means temporary surfaces, loose aggregate and construction traffic — the exact recipe for windshield damage. Add the 104th and 120th Avenue arterials feeding into it and most Thornton drivers are covering a lot of chip-prone miles every week.',
    'That daily distance is also why we push mobile service hard here. If you are already spending an hour a day on I-25, the last thing that makes sense is a second trip south to sit in a waiting room. We bring the glass, the urethane and the calibration gear to your driveway or your office car park, and the vehicle never leaves Thornton.',
    'One local note worth knowing: the damage pattern up here skews towards long cracks rather than clean chips. Highway speed impacts start bigger, and Thornton\'s temperature swings finish the job overnight. A crack that was four inches when you parked can be across the screen by morning, so if you are on the fence, call the same day.'
  ],
  bullets:[
    'Free mobile service throughout Thornton — home, workplace or roadside',
    'Original Thornton, Eastlake, Riverdale, Hunters Glen, Northglenn border and the I-25 corridor',
    'Long-crack assessment — a straight answer on repair versus replacement',
    'No trip south: we bring glass, adhesive and calibration equipment to you',
    'ADAS recalibration handled in-house, not subcontracted to a dealership',
    'Claim filed with your carrier in advance, often at no cost to you'
  ],
  faq:[
    ['My crack is about six inches. Repair or replace?','Six inches is right at the boundary. If it is a single clean crack, away from the edge and outside your direct line of sight, a repair will often hold. If it branches, touches the edge, or sits in front of the driver, replacement is the honest answer — a repair there either fails or leaves distortion where you most need clear glass. We will look and tell you which it is rather than guessing over the phone.'],
    ['It cracked further overnight. Is that normal in Thornton?','Very. Overnight lows here drop hard and the glass contracts, and then a hot defroster in the morning expands the inner layer while the outside is still freezing. That stress is what drives a crack across a windshield. It is the main reason we suggest same-day repair rather than waiting for the weekend.'],
    ['Can you meet me at work rather than at home?','Yes, and most Thornton jobs run that way. Office car parks, industrial yards and even park-and-ride lots work fine as long as there is room to open the doors and we are parked legally. You carry on working and we hand the keys back when it is cured.'],
    ['Do you cover Northglenn and Eastlake too?','Yes. Our Thornton coverage runs across the whole city and over the Northglenn boundary, with no travel charge either side of it.']
  ]
},
{
  slug:'auto-glass-repair-wheat-ridge', city:'Wheat Ridge',
  title:'Wheat Ridge Auto Glass Repair — Mobile Windshield Service, CO',
  desc:'Mobile windshield repair and replacement in Wheat Ridge, CO — minutes from our Sheridan Boulevard shop, so we can usually offer the earliest slot. Call (720) 232-0320.',
  h1:'Wheat Ridge auto glass repair — <span class="hl">we are practically neighbours.</span>',
  sub:'Windshield replacement, chip repair and ADAS calibration across Wheat Ridge. Our shop sits on Sheridan Boulevard at the city line, so this is the shortest run on our schedule.',
  heading:'Our shop is on Sheridan, which makes Wheat Ridge the easy one',
  paras:[
    'We are at 1440 Sheridan Boulevard, effectively on the Wheat Ridge line. In practical terms that means Wheat Ridge jobs are usually the first stop of the day or the one we can slot in when something else finishes early — so if you need glass sorted today rather than Thursday, this is the part of the metro where we are most likely to say yes.',
    'It also makes the in-shop option genuinely easy here. Mobile service is free and it is how we normally work, but some jobs are better done indoors: a replacement in driving snow, or a calibration on a vehicle that demands a level floor and controlled lighting. From most of Wheat Ridge that is a five-minute drive rather than a trek across town, so you get the better job without the inconvenience that usually comes with it.',
    'The local damage pattern is mostly I-70. The frontage roads and the on-ramps at Kipling and Ward throw a lot of stone, and 38th Avenue picks up its share of construction gravel. Most of what we see from Wheat Ridge is repairable if it comes to us in the first week.'
  ],
  bullets:[
    'Minutes from our Sheridan Boulevard shop — realistically the earliest slots we have',
    'Applewood, Fruitdale, Wheat Ridge Town Center, Paramount Heights and the I-70 frontage',
    'Easy in-shop option when weather or calibration makes indoors the better job',
    'Free mobile service at home or work, exactly as everywhere else we cover',
    'Chip repair usually done in 20 to 30 minutes while you carry on',
    'Direct billing to your carrier — Colorado repairs are often fully covered'
  ],
  faq:[
    ['Can you get to me today?','More often in Wheat Ridge than anywhere else we serve. Our shop is on Sheridan at the city line, so a Wheat Ridge job is a short run and easy to fit around the rest of the day. Call in the morning and there is a good chance we can be there the same afternoon.'],
    ['Should I come to the shop or have you come out?','Either — mobile is free and it is what most people choose. The shop is the better option in two situations: bad weather, because urethane needs dry conditions and a workable temperature to bond properly, and calibrations on vehicles that require a level floor with controlled target distances. From Wheat Ridge the shop is close enough that it is barely an inconvenience.'],
    ['Where exactly are you?','1440 Sheridan Boulevard, Denver, CO 80214, right by the city boundary. We are open Monday to Friday 9am to 5pm and Saturday 9am to 2pm, closed Sunday.'],
    ['I got a chip on the I-70 frontage road. Is it worth repairing?','Almost certainly, if you bring it to us early. Most frontage-road chips are small stone impacts that fill well and stop there. What kills a repair is time — dirt and water work into the break and the resin no longer bonds cleanly. Within the first week, results are usually very good.']
  ]
},
];

cityPages.forEach(c=>{
  pages.push({
    slug:c.slug,
    title:c.title,
    desc:c.desc,
    eyebrow:`${c.city}, Colorado`,
    h1:c.h1,
    sub:c.sub,
    svc:'Not sure — help me decide',
    intro:{ heading:c.heading, paras:c.paras, bullets:c.bullets },
    faq:c.faq
  });
});

module.exports = { pages, SERVICES };
