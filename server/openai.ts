import OpenAI from "openai";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
let openai: OpenAI | null = null;

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required to generate AI itineraries");
  }

  openai ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openai;
}

export interface ItineraryDay {
  day: number;
  date: Date;
  title: string;
  timeSlots: {
    id: string;
    startTime: string;
    endTime: string;
    activity: string;
    notes?: string;
  }[];
  notes: string;
}

export async function generateItinerary(
  experienceTitle: string,
  startDate: Date,
  endDate: Date,
  experienceType: string,
  category: string,
  location: string,
  customPrompt?: string
): Promise<ItineraryDay[]> {
  try {
    const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    
    const basePrompt = `Generate a detailed ${totalDays}-day itinerary for a ${experienceType} ${category} experience titled "${experienceTitle}" in ${location}. 
    
    Start date: ${startDate.toDateString()}
    End date: ${endDate.toDateString()}
    
    For each day, provide:
    - A compelling day title
    - 3-5 time slots with specific activities
    - Realistic start and end times
    - Brief activity descriptions
    - Optional notes for special considerations
    
    Make the itinerary engaging, well-paced, and appropriate for the experience type and category.`;

    const jsonFormat = `
    {
      "days": [
        {
          "day": 1,
          "title": "Day title",
          "timeSlots": [
            {
              "startTime": "09:00",
              "endTime": "10:30",
              "activity": "Activity name",
              "notes": "Optional notes"
            }
          ],
          "notes": "Day-level notes"
        }
      ]
    }`;

    const prompt = customPrompt ? 
      `${basePrompt}
      
      Additional custom instructions: ${customPrompt}
      
      Respond with JSON in this exact format:${jsonFormat}` : 
      `${basePrompt}
      
      Respond with JSON in this exact format:${jsonFormat}`;

    const response = await getOpenAIClient().chat.completions.create({
      model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: "You are an expert experience planner. Generate detailed, engaging itineraries that create memorable experiences. Always respond with valid JSON."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("No response content from OpenAI");
    }
    const result = JSON.parse(content);
    
    return result.days.map((day: any, index: number) => {
      const dayDate = new Date(startDate);
      dayDate.setDate(startDate.getDate() + index);
      
      return {
        day: index + 1,
        date: dayDate,
        title: day.title,
        timeSlots: day.timeSlots.map((slot: any, slotIndex: number) => ({
          id: `slot-${index + 1}-${slotIndex + 1}`,
          startTime: slot.startTime,
          endTime: slot.endTime,
          activity: slot.activity,
          notes: slot.notes || ""
        })),
        notes: day.notes || ""
      };
    });
  } catch (error) {
    console.error("Failed to generate itinerary:", error);
    throw new Error("Failed to generate itinerary. Please try again.");
  }
}
