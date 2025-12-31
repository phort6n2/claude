import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// PAA Questions organized by service and category
// Priority 1-10 = high priority (foundational), 11-200 = regular

interface PAAQuestionSeed {
  question: string
  service: string
  priority: number
  category: string
}

const paaQuestions: PAAQuestionSeed[] = [
  // =============================================
  // WINDSHIELD REPLACEMENT - High Priority (1-10)
  // =============================================
  { question: "How much does windshield replacement cost in {location}?", service: "windshield replacement", priority: 1, category: "cost" },
  { question: "Does insurance cover windshield replacement?", service: "windshield replacement", priority: 2, category: "insurance" },
  { question: "How long does windshield replacement take?", service: "windshield replacement", priority: 3, category: "process" },
  { question: "Can I drive after windshield replacement?", service: "windshield replacement", priority: 4, category: "safety" },
  { question: "What is the difference between OEM and aftermarket windshields?", service: "windshield replacement", priority: 5, category: "quality" },
  { question: "Do I need ADAS calibration after windshield replacement?", service: "windshield replacement", priority: 6, category: "adas" },
  { question: "Is mobile windshield replacement safe?", service: "windshield replacement", priority: 7, category: "safety" },
  { question: "How do I know if my windshield needs to be replaced?", service: "windshield replacement", priority: 8, category: "assessment" },
  { question: "What causes windshields to crack?", service: "windshield replacement", priority: 9, category: "causes" },
  { question: "Will my insurance rates go up after windshield claim?", service: "windshield replacement", priority: 10, category: "insurance" },

  // WINDSHIELD REPLACEMENT - Regular Priority
  { question: "What is the best type of windshield glass?", service: "windshield replacement", priority: 11, category: "quality" },
  { question: "How much does a windshield cost without insurance?", service: "windshield replacement", priority: 12, category: "cost" },
  { question: "Can a cracked windshield shatter while driving?", service: "windshield replacement", priority: 13, category: "safety" },
  { question: "What happens if you don't replace a cracked windshield?", service: "windshield replacement", priority: 14, category: "safety" },
  { question: "How long does windshield adhesive take to cure?", service: "windshield replacement", priority: 15, category: "process" },
  { question: "Can windshield replacement be done in the rain?", service: "windshield replacement", priority: 16, category: "process" },
  { question: "What is the average cost of windshield replacement?", service: "windshield replacement", priority: 17, category: "cost" },
  { question: "Is it illegal to drive with a cracked windshield?", service: "windshield replacement", priority: 18, category: "legal" },
  { question: "How often should windshields be replaced?", service: "windshield replacement", priority: 19, category: "maintenance" },
  { question: "What warranty comes with windshield replacement?", service: "windshield replacement", priority: 20, category: "warranty" },
  { question: "Can I wash my car after windshield replacement?", service: "windshield replacement", priority: 21, category: "aftercare" },
  { question: "How is a windshield installed?", service: "windshield replacement", priority: 22, category: "process" },
  { question: "What is the safest windshield brand?", service: "windshield replacement", priority: 23, category: "quality" },
  { question: "Does windshield replacement affect resale value?", service: "windshield replacement", priority: 24, category: "value" },
  { question: "Can a windshield crack from cold weather?", service: "windshield replacement", priority: 25, category: "causes" },
  { question: "What is laminated glass in windshields?", service: "windshield replacement", priority: 26, category: "technology" },
  { question: "How do I file a windshield insurance claim?", service: "windshield replacement", priority: 27, category: "insurance" },
  { question: "What is the deductible for windshield replacement?", service: "windshield replacement", priority: 28, category: "insurance" },
  { question: "Can you repair a windshield instead of replacing it?", service: "windshield replacement", priority: 29, category: "assessment" },
  { question: "What are the signs of a bad windshield installation?", service: "windshield replacement", priority: 30, category: "quality" },

  // =============================================
  // ROCK CHIP REPAIR - High Priority (1-10)
  // =============================================
  { question: "How much does rock chip repair cost?", service: "rock chip repair", priority: 1, category: "cost" },
  { question: "Can rock chips be repaired or do they need replacement?", service: "rock chip repair", priority: 2, category: "assessment" },
  { question: "How long does rock chip repair take?", service: "rock chip repair", priority: 3, category: "process" },
  { question: "Is rock chip repair covered by insurance?", service: "rock chip repair", priority: 4, category: "insurance" },
  { question: "Does rock chip repair really work?", service: "rock chip repair", priority: 5, category: "effectiveness" },
  { question: "Can I drive after rock chip repair?", service: "rock chip repair", priority: 6, category: "aftercare" },
  { question: "How big of a chip can be repaired?", service: "rock chip repair", priority: 7, category: "assessment" },
  { question: "Will rock chip repair be visible?", service: "rock chip repair", priority: 8, category: "aesthetics" },
  { question: "How do I prevent rock chips?", service: "rock chip repair", priority: 9, category: "prevention" },
  { question: "Should I repair a rock chip right away?", service: "rock chip repair", priority: 10, category: "urgency" },

  // ROCK CHIP REPAIR - Regular Priority
  { question: "What causes rock chips in windshields?", service: "rock chip repair", priority: 11, category: "causes" },
  { question: "Can multiple rock chips be repaired?", service: "rock chip repair", priority: 12, category: "assessment" },
  { question: "How is a rock chip repaired?", service: "rock chip repair", priority: 13, category: "process" },
  { question: "Is DIY rock chip repair effective?", service: "rock chip repair", priority: 14, category: "diy" },
  { question: "Can rock chips spread into cracks?", service: "rock chip repair", priority: 15, category: "urgency" },
  { question: "What is the best temperature for rock chip repair?", service: "rock chip repair", priority: 16, category: "process" },
  { question: "Does rock chip repair weaken the windshield?", service: "rock chip repair", priority: 17, category: "safety" },
  { question: "Can rock chips in driver view be repaired?", service: "rock chip repair", priority: 18, category: "assessment" },
  { question: "How long does rock chip repair last?", service: "rock chip repair", priority: 19, category: "durability" },
  { question: "What is the difference between chip repair and replacement?", service: "rock chip repair", priority: 20, category: "assessment" },
  { question: "Can rock chip repair pass inspection?", service: "rock chip repair", priority: 21, category: "legal" },
  { question: "Is mobile rock chip repair as good as shop repair?", service: "rock chip repair", priority: 22, category: "quality" },
  { question: "What is resin injection repair?", service: "rock chip repair", priority: 23, category: "technology" },
  { question: "Can old rock chips be repaired?", service: "rock chip repair", priority: 24, category: "assessment" },
  { question: "Why do rock chips appear out of nowhere?", service: "rock chip repair", priority: 25, category: "causes" },

  // =============================================
  // ADAS CALIBRATION - High Priority (1-10)
  // =============================================
  { question: "What is ADAS calibration?", service: "ADAS calibration", priority: 1, category: "basics" },
  { question: "How much does ADAS calibration cost?", service: "ADAS calibration", priority: 2, category: "cost" },
  { question: "Do I need ADAS calibration after windshield replacement?", service: "ADAS calibration", priority: 3, category: "requirements" },
  { question: "How long does ADAS calibration take?", service: "ADAS calibration", priority: 4, category: "process" },
  { question: "What happens if ADAS is not calibrated?", service: "ADAS calibration", priority: 5, category: "safety" },
  { question: "Is ADAS calibration covered by insurance?", service: "ADAS calibration", priority: 6, category: "insurance" },
  { question: "What vehicles require ADAS calibration?", service: "ADAS calibration", priority: 7, category: "requirements" },
  { question: "What is the difference between static and dynamic calibration?", service: "ADAS calibration", priority: 8, category: "types" },
  { question: "Can any auto glass shop do ADAS calibration?", service: "ADAS calibration", priority: 9, category: "providers" },
  { question: "How do I know if my ADAS needs calibration?", service: "ADAS calibration", priority: 10, category: "assessment" },

  // ADAS CALIBRATION - Regular Priority
  { question: "What does ADAS stand for?", service: "ADAS calibration", priority: 11, category: "basics" },
  { question: "What sensors are included in ADAS?", service: "ADAS calibration", priority: 12, category: "technology" },
  { question: "Can ADAS calibration be done at home?", service: "ADAS calibration", priority: 13, category: "diy" },
  { question: "Why is ADAS calibration so expensive?", service: "ADAS calibration", priority: 14, category: "cost" },
  { question: "Does ADAS calibration require special equipment?", service: "ADAS calibration", priority: 15, category: "technology" },
  { question: "What is forward collision warning calibration?", service: "ADAS calibration", priority: 16, category: "types" },
  { question: "Does my car have ADAS?", service: "ADAS calibration", priority: 17, category: "requirements" },
  { question: "Can ADAS fail after calibration?", service: "ADAS calibration", priority: 18, category: "safety" },
  { question: "What is lane departure warning calibration?", service: "ADAS calibration", priority: 19, category: "types" },
  { question: "How accurate is ADAS calibration?", service: "ADAS calibration", priority: 20, category: "quality" },
  { question: "Does Honda require ADAS calibration?", service: "ADAS calibration", priority: 21, category: "requirements" },
  { question: "Does Toyota require ADAS calibration?", service: "ADAS calibration", priority: 22, category: "requirements" },
  { question: "Does Ford require ADAS calibration?", service: "ADAS calibration", priority: 23, category: "requirements" },
  { question: "What is camera calibration for windshield?", service: "ADAS calibration", priority: 24, category: "technology" },
  { question: "Can I skip ADAS calibration?", service: "ADAS calibration", priority: 25, category: "safety" },
  { question: "What is OEM ADAS calibration?", service: "ADAS calibration", priority: 26, category: "types" },
  { question: "How is static ADAS calibration performed?", service: "ADAS calibration", priority: 27, category: "process" },
  { question: "How is dynamic ADAS calibration performed?", service: "ADAS calibration", priority: 28, category: "process" },
  { question: "What are ADAS calibration targets?", service: "ADAS calibration", priority: 29, category: "technology" },
  { question: "Does ADAS calibration come with warranty?", service: "ADAS calibration", priority: 30, category: "warranty" },

  // =============================================
  // SIDE WINDOW REPLACEMENT - High Priority (1-10)
  // =============================================
  { question: "How much does side window replacement cost?", service: "side window replacement", priority: 1, category: "cost" },
  { question: "How long does side window replacement take?", service: "side window replacement", priority: 2, category: "process" },
  { question: "Is side window replacement covered by insurance?", service: "side window replacement", priority: 3, category: "insurance" },
  { question: "Can side windows be repaired instead of replaced?", service: "side window replacement", priority: 4, category: "assessment" },
  { question: "What is the difference between door glass and quarter glass?", service: "side window replacement", priority: 5, category: "types" },
  { question: "How do I secure my car after window break-in?", service: "side window replacement", priority: 6, category: "emergency" },
  { question: "Can I drive with a broken side window?", service: "side window replacement", priority: 7, category: "safety" },
  { question: "What causes side windows to shatter?", service: "side window replacement", priority: 8, category: "causes" },
  { question: "Is side window glass tempered or laminated?", service: "side window replacement", priority: 9, category: "technology" },
  { question: "Does side window replacement require calibration?", service: "side window replacement", priority: 10, category: "adas" },

  // SIDE WINDOW REPLACEMENT - Regular Priority
  { question: "How much does a car door window cost?", service: "side window replacement", priority: 11, category: "cost" },
  { question: "Can you tint replacement windows?", service: "side window replacement", priority: 12, category: "options" },
  { question: "What is quarter glass on a car?", service: "side window replacement", priority: 13, category: "types" },
  { question: "How do I clean broken glass from my car?", service: "side window replacement", priority: 14, category: "aftercare" },
  { question: "Does comprehensive insurance cover broken windows?", service: "side window replacement", priority: 15, category: "insurance" },
  { question: "Can a side window explode in heat?", service: "side window replacement", priority: 16, category: "causes" },
  { question: "What is the deductible for broken car window?", service: "side window replacement", priority: 17, category: "insurance" },
  { question: "How much does emergency window repair cost?", service: "side window replacement", priority: 18, category: "cost" },
  { question: "Can mobile service replace side windows?", service: "side window replacement", priority: 19, category: "process" },
  { question: "Does window replacement affect power windows?", service: "side window replacement", priority: 20, category: "electrical" },

  // =============================================
  // REAR WINDOW REPLACEMENT - High Priority (1-10)
  // =============================================
  { question: "How much does rear window replacement cost?", service: "rear window replacement", priority: 1, category: "cost" },
  { question: "How long does rear window replacement take?", service: "rear window replacement", priority: 2, category: "process" },
  { question: "Is rear window replacement covered by insurance?", service: "rear window replacement", priority: 3, category: "insurance" },
  { question: "Does rear window replacement include defroster?", service: "rear window replacement", priority: 4, category: "features" },
  { question: "Can rear windows be repaired?", service: "rear window replacement", priority: 5, category: "assessment" },
  { question: "What causes rear windows to crack?", service: "rear window replacement", priority: 6, category: "causes" },
  { question: "Is rear window glass tempered?", service: "rear window replacement", priority: 7, category: "technology" },
  { question: "How do I protect my car after rear window breaks?", service: "rear window replacement", priority: 8, category: "emergency" },
  { question: "Can you drive with broken rear window?", service: "rear window replacement", priority: 9, category: "safety" },
  { question: "Does rear window replacement affect backup camera?", service: "rear window replacement", priority: 10, category: "technology" },

  // REAR WINDOW REPLACEMENT - Regular Priority
  { question: "How much is a back window for a car?", service: "rear window replacement", priority: 11, category: "cost" },
  { question: "Can rear defroster be repaired?", service: "rear window replacement", priority: 12, category: "repair" },
  { question: "What is the difference between rear windshield and back glass?", service: "rear window replacement", priority: 13, category: "basics" },
  { question: "Does rear window have antenna built in?", service: "rear window replacement", priority: 14, category: "features" },
  { question: "How long until rear window adhesive cures?", service: "rear window replacement", priority: 15, category: "process" },
  { question: "Can rear window tint be applied after replacement?", service: "rear window replacement", priority: 16, category: "options" },
  { question: "What causes spontaneous rear window breakage?", service: "rear window replacement", priority: 17, category: "causes" },
  { question: "Is mobile rear window replacement available?", service: "rear window replacement", priority: 18, category: "process" },
  { question: "What is privacy glass on rear window?", service: "rear window replacement", priority: 19, category: "technology" },
  { question: "Does rear window replacement void warranty?", service: "rear window replacement", priority: 20, category: "warranty" },

  // =============================================
  // AUTO GLASS GENERAL - High Priority (1-10)
  // =============================================
  { question: "What is the best auto glass company near me?", service: "auto glass general", priority: 1, category: "providers" },
  { question: "How much does auto glass repair cost?", service: "auto glass general", priority: 2, category: "cost" },
  { question: "Is mobile auto glass service reliable?", service: "auto glass general", priority: 3, category: "quality" },
  { question: "What is the difference between auto glass repair and replacement?", service: "auto glass general", priority: 4, category: "assessment" },
  { question: "Does auto glass work come with warranty?", service: "auto glass general", priority: 5, category: "warranty" },
  { question: "How do I choose an auto glass company?", service: "auto glass general", priority: 6, category: "providers" },
  { question: "Is auto glass repair safe?", service: "auto glass general", priority: 7, category: "safety" },
  { question: "What certifications should auto glass technicians have?", service: "auto glass general", priority: 8, category: "quality" },
  { question: "Can auto glass be replaced same day?", service: "auto glass general", priority: 9, category: "process" },
  { question: "What is OEM vs aftermarket auto glass?", service: "auto glass general", priority: 10, category: "quality" },

  // AUTO GLASS GENERAL - Regular Priority
  { question: "How do I find a certified auto glass installer?", service: "auto glass general", priority: 11, category: "providers" },
  { question: "What is the best time of year for auto glass replacement?", service: "auto glass general", priority: 12, category: "tips" },
  { question: "Does auto glass replacement affect my car warranty?", service: "auto glass general", priority: 13, category: "warranty" },
  { question: "What questions should I ask an auto glass shop?", service: "auto glass general", priority: 14, category: "tips" },
  { question: "How do I maintain my auto glass?", service: "auto glass general", priority: 15, category: "maintenance" },
  { question: "What is the safest type of auto glass?", service: "auto glass general", priority: 16, category: "safety" },
  { question: "Can auto glass be recycled?", service: "auto glass general", priority: 17, category: "environment" },
  { question: "What is acoustic auto glass?", service: "auto glass general", priority: 18, category: "technology" },
  { question: "What is heads-up display compatible glass?", service: "auto glass general", priority: 19, category: "technology" },
  { question: "What is rain sensing windshield?", service: "auto glass general", priority: 20, category: "technology" },
  { question: "What is heated windshield?", service: "auto glass general", priority: 21, category: "technology" },
  { question: "What is solar control glass?", service: "auto glass general", priority: 22, category: "technology" },
  { question: "What is infrared reflective glass?", service: "auto glass general", priority: 23, category: "technology" },
  { question: "What is water repellent windshield coating?", service: "auto glass general", priority: 24, category: "technology" },
  { question: "What is gorilla glass for cars?", service: "auto glass general", priority: 25, category: "technology" },

  // =============================================
  // INSURANCE QUESTIONS - High Priority (1-10)
  // =============================================
  { question: "Does insurance cover auto glass in {location}?", service: "insurance claims", priority: 1, category: "coverage" },
  { question: "What is comprehensive coverage for auto glass?", service: "insurance claims", priority: 2, category: "coverage" },
  { question: "How do I file an auto glass insurance claim?", service: "insurance claims", priority: 3, category: "process" },
  { question: "Will my rates increase for glass claim?", service: "insurance claims", priority: 4, category: "rates" },
  { question: "What is a zero deductible glass policy?", service: "insurance claims", priority: 5, category: "coverage" },
  { question: "Does full coverage include windshield?", service: "insurance claims", priority: 6, category: "coverage" },
  { question: "Can I choose my own auto glass shop?", service: "insurance claims", priority: 7, category: "providers" },
  { question: "How long does glass claim take to process?", service: "insurance claims", priority: 8, category: "process" },
  { question: "Do I pay deductible for windshield claim?", service: "insurance claims", priority: 9, category: "cost" },
  { question: "What if my deductible is more than repair cost?", service: "insurance claims", priority: 10, category: "cost" },

  // INSURANCE QUESTIONS - Regular Priority
  { question: "Does State Farm cover windshield replacement?", service: "insurance claims", priority: 11, category: "providers" },
  { question: "Does Geico cover windshield replacement?", service: "insurance claims", priority: 12, category: "providers" },
  { question: "Does Progressive cover windshield replacement?", service: "insurance claims", priority: 13, category: "providers" },
  { question: "Does Allstate cover windshield replacement?", service: "insurance claims", priority: 14, category: "providers" },
  { question: "What is glass coverage endorsement?", service: "insurance claims", priority: 15, category: "coverage" },
  { question: "Is windshield replacement free in Arizona?", service: "insurance claims", priority: 16, category: "state-laws" },
  { question: "Is windshield replacement free in Florida?", service: "insurance claims", priority: 17, category: "state-laws" },
  { question: "What states have free windshield replacement?", service: "insurance claims", priority: 18, category: "state-laws" },
  { question: "Does glass claim affect no claims bonus?", service: "insurance claims", priority: 19, category: "rates" },
  { question: "Can insurance deny windshield claim?", service: "insurance claims", priority: 20, category: "disputes" },

  // =============================================
  // MOBILE SERVICE QUESTIONS
  // =============================================
  { question: "Is mobile auto glass repair as good as shop?", service: "mobile service", priority: 1, category: "quality" },
  { question: "How does mobile windshield replacement work?", service: "mobile service", priority: 2, category: "process" },
  { question: "Is mobile auto glass replacement safe?", service: "mobile service", priority: 3, category: "safety" },
  { question: "How long does mobile windshield installation take?", service: "mobile service", priority: 4, category: "process" },
  { question: "What is the cost of mobile auto glass service?", service: "mobile service", priority: 5, category: "cost" },
  { question: "Can mobile service do ADAS calibration?", service: "mobile service", priority: 6, category: "capabilities" },
  { question: "What if it rains during mobile installation?", service: "mobile service", priority: 7, category: "weather" },
  { question: "Does mobile service offer warranty?", service: "mobile service", priority: 8, category: "warranty" },
  { question: "Can mobile service replace any window?", service: "mobile service", priority: 9, category: "capabilities" },
  { question: "What equipment do mobile technicians use?", service: "mobile service", priority: 10, category: "technology" },
  { question: "Is there extra charge for mobile service?", service: "mobile service", priority: 11, category: "cost" },
  { question: "Can mobile service come to my work?", service: "mobile service", priority: 12, category: "convenience" },
  { question: "What time does mobile glass service start?", service: "mobile service", priority: 13, category: "scheduling" },
  { question: "Does mobile service work weekends?", service: "mobile service", priority: 14, category: "scheduling" },
  { question: "How do I prepare for mobile glass service?", service: "mobile service", priority: 15, category: "tips" },

  // =============================================
  // SUNROOF/MOONROOF QUESTIONS
  // =============================================
  { question: "How much does sunroof glass replacement cost?", service: "sunroof replacement", priority: 1, category: "cost" },
  { question: "Can sunroof glass be repaired?", service: "sunroof replacement", priority: 2, category: "assessment" },
  { question: "What causes sunroof glass to shatter?", service: "sunroof replacement", priority: 3, category: "causes" },
  { question: "Is sunroof replacement covered by insurance?", service: "sunroof replacement", priority: 4, category: "insurance" },
  { question: "How long does sunroof replacement take?", service: "sunroof replacement", priority: 5, category: "process" },
  { question: "What is the difference between sunroof and moonroof?", service: "sunroof replacement", priority: 6, category: "basics" },
  { question: "Can mobile service replace sunroof?", service: "sunroof replacement", priority: 7, category: "process" },
  { question: "Why is my sunroof leaking after replacement?", service: "sunroof replacement", priority: 8, category: "problems" },
  { question: "Does sunroof replacement affect panoramic roof?", service: "sunroof replacement", priority: 9, category: "types" },
  { question: "What is tempered sunroof glass?", service: "sunroof replacement", priority: 10, category: "technology" },

  // =============================================
  // WINDSHIELD CRACK REPAIR
  // =============================================
  { question: "Can a windshield crack be repaired?", service: "windshield crack repair", priority: 1, category: "assessment" },
  { question: "How much does windshield crack repair cost?", service: "windshield crack repair", priority: 2, category: "cost" },
  { question: "How long of a crack can be repaired?", service: "windshield crack repair", priority: 3, category: "assessment" },
  { question: "Does crack repair stop spreading?", service: "windshield crack repair", priority: 4, category: "effectiveness" },
  { question: "Will a repaired crack be visible?", service: "windshield crack repair", priority: 5, category: "aesthetics" },
  { question: "How long does crack repair last?", service: "windshield crack repair", priority: 6, category: "durability" },
  { question: "Can stress cracks be repaired?", service: "windshield crack repair", priority: 7, category: "types" },
  { question: "What is the longest crack that can be fixed?", service: "windshield crack repair", priority: 8, category: "assessment" },
  { question: "Does cold weather affect crack repair?", service: "windshield crack repair", priority: 9, category: "process" },
  { question: "Should I repair or replace a cracked windshield?", service: "windshield crack repair", priority: 10, category: "assessment" },

  // =============================================
  // COMMERCIAL VEHICLE GLASS
  // =============================================
  { question: "How much does commercial truck windshield replacement cost?", service: "commercial glass", priority: 1, category: "cost" },
  { question: "Do you offer fleet auto glass services?", service: "commercial glass", priority: 2, category: "services" },
  { question: "Can you replace windshields on semi trucks?", service: "commercial glass", priority: 3, category: "capabilities" },
  { question: "Is there a discount for fleet glass replacement?", service: "commercial glass", priority: 4, category: "cost" },
  { question: "Do commercial vehicles need ADAS calibration?", service: "commercial glass", priority: 5, category: "adas" },
  { question: "Can mobile service handle commercial vehicles?", service: "commercial glass", priority: 6, category: "process" },
  { question: "What is DOT approved windshield?", service: "commercial glass", priority: 7, category: "regulations" },
  { question: "How long does semi truck windshield replacement take?", service: "commercial glass", priority: 8, category: "process" },
  { question: "Do you offer after hours commercial glass service?", service: "commercial glass", priority: 9, category: "scheduling" },
  { question: "Can you invoice for fleet glass work?", service: "commercial glass", priority: 10, category: "billing" },
]

async function main() {
  console.log('Starting PAA question seeding...')

  // Clear existing PAA questions (optional - comment out if you want to preserve existing)
  // await prisma.pAAQuestion.deleteMany()
  // console.log('Cleared existing PAA questions')

  // Insert PAA questions, skipping duplicates
  let created = 0
  let skipped = 0

  for (const paa of paaQuestions) {
    try {
      await prisma.pAAQuestion.upsert({
        where: {
          question_service: {
            question: paa.question,
            service: paa.service,
          },
        },
        update: {
          priority: paa.priority,
          category: paa.category,
          isActive: true,
        },
        create: {
          question: paa.question,
          service: paa.service,
          priority: paa.priority,
          category: paa.category,
          isActive: true,
        },
      })
      created++
    } catch {
      skipped++
    }
  }

  console.log(`Seeding complete:`)
  console.log(`  - Created/Updated: ${created}`)
  console.log(`  - Skipped: ${skipped}`)
  console.log(`  - Total questions: ${paaQuestions.length}`)

  // Count by service
  const serviceCounts = await prisma.pAAQuestion.groupBy({
    by: ['service'],
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  })

  console.log('\nQuestions by service:')
  for (const { service, _count } of serviceCounts) {
    console.log(`  - ${service}: ${_count.id}`)
  }
}

main()
  .catch((e) => {
    console.error('Error seeding PAA questions:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
