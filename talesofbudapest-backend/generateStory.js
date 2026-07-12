import { supabase } from './supabaseClient.js';
import { createChatCompletion } from './lib/openRouterClient.js';
import dotenv from 'dotenv';

dotenv.config();

const generateTourScript = async () => {
  const { data: location, error: dbError } = await supabase
    .from('locations')
    .select('*')
    .eq('name', 'Hungarian Parliament Building')
    .single();

  if (dbError || !location) {
    console.error('❌ Database fetch failed:', dbError?.message || 'Location not found');
    return;
  }

  console.log(`📍 Found location: "${location.name}". Handing off to OpenRouter...`);

  try {
    const chatCompletion = await createChatCompletion({
      operation: 'demo.generate_story',
      messages: [
        {
          role: 'system',
          content:
            'You are an immersive, deeply engaging AI audio tour guide. Explain the history like you would explain to a 10 year old student. Make it short and simple.',
        },
        {
          role: 'user',
          content: `Write an engaging audio guide script for someone standing right in front of this landmark:

          Landmark Name: ${location.name}
          Context/Vibe: ${location.story_prompt}`,
        },
      ],
    });

    console.log('\n✨ --- GENERATED TOUR SCRIPT (OpenRouter) --- ✨');
    console.log(chatCompletion.choices[0]?.message?.content);
    console.log('---------------------------------------------\n');
  } catch (aiError) {
    console.error('❌ OpenRouter generation failed:', aiError.message);
  }
};

generateTourScript();
