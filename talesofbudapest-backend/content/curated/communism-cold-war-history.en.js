import {
  CURATED_TOUR_SLUG,
  CURATED_TOUR_VERSION,
  FIRST_LIGHT_PARTICLES,
  LOCATION_SLUGS,
  SOURCES,
  STOP_COORDINATES,
  WALKING_ROUTE,
} from './communism-cold-war-history.common.js';

const stop = (key, title, script, sourceIds, audioDirection, extra = {}) => ({
  key,
  locationSlug: LOCATION_SLUGS[key],
  title,
  ...STOP_COORDINATES[key],
  script: script.trim(),
  sourceIds,
  audioDirection,
  observationMinutes: extra.observationMinutes ?? 4,
  ...extra,
});

export const COMMUNISM_COLD_WAR_TOUR_EN = {
  slug: CURATED_TOUR_SLUG,
  version: CURATED_TOUR_VERSION,
  locale: 'en',
  title: 'Communism & Cold War History Tour',
  tagline: 'About 2¾ h · nine sites from Stalinism to 1989',
  description: 'A source-checked walk through political policing, the 1956 Revolution, Cold War Budapest and the negotiated end of one-party rule.',
  walkingRoute: WALKING_ROUTE,
  walkingDistanceRangeMeters: [7000, 8200],
  scriptWordRange: [330, 520],
  sources: SOURCES,
  audioDesign: {
    musicAsset: FIRST_LIGHT_PARTICLES,
    voiceDirection: 'Measured documentary delivery at 118–125 words per minute. Clear dates and Hungarian names; no theatrical impersonation.',
    scorePalette: 'Use only the CC0 “First Light Particles” cue. Do not add sound effects, archival audio, national anthems or other music.',
    mixRules: [
      'Keep opening beds under 10 seconds and duck them at least 12 dB beneath narration.',
      'Do not add location ambience, archival recordings or reconstructed effects in this version.',
      'Do not simulate gunfire, screams, interrogations, executions or crowd panic at sites of death and repression.',
      'End each chapter cleanly before walking directions so traffic and navigation remain audible.',
    ],
  },
  stops: [
    stop('house-of-terror', '1. The Address the Secret Police Took Over', `
Stand across Andrássy Avenue and look at number 60. The building is now the House of Terror museum. In 1944 it served the Hungarian Arrow Cross movement. After the war, it was taken over by the new communist political police. That sequence matters: two different dictatorships used the same address, but they were not the same system and their crimes should not be blurred together.

The communist political police established its headquarters here in 1945. Its name and organisation changed several times—from the Political Police Department, or PRO, through the ÁVO and then the ÁVH—but its function was consistent: identify opponents, obtain confessions, build cases and intimidate society. Targets included former officials, landowners, clergy, Social Democrats, independent smallholders and eventually communists caught in the party’s own purges.

The building itself became part of the machinery. The police connected basement areas beneath neighbouring properties and used cells and interrogation rooms below street level. One correction is essential: Andrássy út 60 is often described as an execution site. The museum’s own account says it was not an official place of execution. Prisoners were interrogated and abused here, then could be transferred elsewhere for trial, imprisonment or death. Keeping that distinction does not soften what happened; it keeps the site’s history exact.

The headquarters eventually expanded beyond this one façade, occupying offices and basement space in nearby buildings. That physical growth followed the expanding reach of the organisation.

The broader system accelerated after the communist takeover was consolidated in 1948 and 1949. Show trials produced scripted accusations and predetermined outcomes. The best-known communist victim was László Rajk, a former interior minister, who was tried and executed in 1949. His case showed party officials that loyalty did not provide safety. Surveillance and denunciation carried the threat beyond prison walls into workplaces and apartment blocks.

Look at the metal canopy spelling TERROR. It is a post-communist museum intervention, not a surviving sign from the period. The historical evidence is the address, the institutional records and testimony—not every visual element you see today.

Walk down Andrássy Avenue to Oktogon. It takes only a few minutes. The next stop moves from hidden coercion to public display: renamed streets, compulsory ceremonies and an enormous statue whose most famous remains were its boots.
    `, ['TERROR_HOUSE_POLITICAL_POLICE', 'TERROR_HOUSE_CELLS', 'HUNGARIAN_ARCHIVES_RAJK'], {
      music: { enabled: false },
      opening: 'No added music or effects; keep the chapter dry and clear.',
      bed: 'No music beneath the discussion of detention, abuse or executions.',
      avoid: 'No prison-door slam, scream, heartbeat or interrogation reconstruction.',
    }),

    stop('oktogon', '2. Renaming the City—and Stalin’s Empty Boots', `
Stand where the Grand Boulevard crosses Andrássy Avenue. Today the junction is Oktogon, a name based on the eight-sided space created by the surrounding façades. Under communist rule, even this practical name became political.

The square was renamed November 7 Square, marking the date assigned to the Bolshevik Revolution in the old Russian calendar. Andrássy Avenue also lost its familiar name. It became Stalin Road in 1950, then Avenue of the Hungarian Youth after the 1956 Revolution, and later People’s Republic Road. The historical name returned in 1990. These changes were cheap compared with rebuilding a city, but highly visible. An address on a letter, a tram announcement or directions to a shop repeated the current political order.

Public ritual did the same work. State May Day parades required portraits of Mátyás Rákosi, Hungary’s Stalinist leader, and Joseph Stalin. The biggest object in this visual system stood farther northeast, beside City Park: an eight-metre bronze statue of Stalin on a ten-metre tribune. It was unveiled in December 1951 before a reported crowd of about eighty thousand.

On 23 October 1956, demonstrators pulled the statue down. They cut and levered at its legs until the body fell, leaving the boots attached to the pedestal. Fragments were dragged through the city and people chipped off pieces as souvenirs. The empty boots became one of the revolution’s clearest images: a cult of personality reduced to scrap metal. A modern memorial near the statue’s former site deliberately recalls the boots, but it is a later artwork.

Here is a useful detail about photographs. A 1956 Fortepan image identifies this junction as November 7 Square. That label helps date the political map even when banners or soldiers are absent. Street names can function like timestamps.

The regime was not maintained by names and statues alone; the previous stop showed the coercive apparatus behind them. But propaganda also depended on repetition and normality. Political language was built into the route to work.

For the next chapter, take public transport or walk northwest to Jászai Mari Square. The longer transfer is intentional: it links the Stalinist city centre to Imre Nagy, a communist politician who tried to take Hungary out of the Soviet bloc and paid with his life.
    `, ['STALIN_STATUE_BHM', 'STALIN_STATUE_TERROR_HOUSE', 'FORTEPAN_OKTOGON', 'PESTBUDA_OKTOGON', 'PESTBUDA_ANDRASSY'], {
      music: { enabled: true },
      opening: 'Start with the short CC0 music cue only; no added footsteps or tram effect.',
      bed: 'Fade the cue cleanly within the opening ten seconds, well before walking directions.',
      avoid: 'No anthem excerpt, crowd effect or other added audio.',
    }),

    stop('imre-nagy-statue', '3. Imre Nagy: A Communist Who Broke with Moscow', `
Find the bronze figure of Imre Nagy on the small bridge. This statue originally stood near Parliament from 1996 until 2018. It was moved here and unveiled at Jászai Mari Square in 2019. The bridge is symbolic: Nagy looks like a man caught between positions, which is close to the political problem he faced.

Nagy was not an anti-communist outsider. He had been a communist for decades, spent years in the Soviet Union and served in the postwar Hungarian government. He became prime minister in 1953 and promoted what was called a “New Course”: easing police terror, slowing forced industrialisation and improving living conditions. Party hard-liners removed him in 1955.

When the uprising began on 23 October 1956, protesters demanded that Nagy return. He became prime minister again while events moved faster than the party could control. Over the following days he recognised the revolution as a national democratic movement, accepted a multi-party government and announced the dissolution of the ÁVH. On 1 November he declared Hungary neutral and said the country would withdraw from the Warsaw Pact. This was the decisive break with Moscow.

Soviet forces attacked Budapest on 4 November. Nagy made a short radio announcement stating that Soviet troops had attacked the capital and that the government was at its post. He later took refuge in the Yugoslav Embassy. After receiving assurances of safe conduct, he left the embassy, was seized and eventually taken to Romania. A secret trial followed. Nagy and two co-defendants were executed on 16 June 1958. He was buried under a false name in the remote section known as Plot 301.

The date returned thirty-one years later. On 16 June 1989, Nagy and other victims were ceremonially reburied. A sixth, empty coffin represented those whose bodies had not been identified. The event at Heroes’ Square drew a large crowd and became a major public marker of the regime’s collapse. Nagy was legally rehabilitated soon afterward.

The “fun fact” here is political, not light-hearted: a communist reformer became one of the central symbols of opposition to communist rule. That contradiction is why his memory remains contested.

Continue south along the Danube-side streets to Kossuth Square. We now move from the decisions of leaders to an unarmed crowd caught in gunfire.
    `, ['NAGY_IMRE_NEB', 'NAGY_IMRE_STATUE', 'MNM_1956_2000', 'MNM_NAGY_BROADCAST'], {
      music: { enabled: false },
      opening: 'No added music or effects; use a clean narration start.',
      bed: 'No music, particularly during the arrest, trial and execution sequence.',
      avoid: 'No gallows sound, heartbeat or ominous cinematic hit.',
    }),

    stop('kossuth-square', '4. Bloody Thursday, Without False Precision', `
Stand on Kossuth Square with Parliament in view. On 25 October 1956, two days after the uprising began, a large crowd gathered here. Many were unarmed. Some expected a political announcement; others came to demonstrate or simply followed the movement of people through the city.

Gunfire struck the square. Many people were killed and wounded. Beyond those statements, caution is necessary. Accounts disagree about the exact sequence, the positions of shooters and the number of casualties. Contemporary confusion, later political narratives and incomplete evidence produced estimates that vary widely. A responsible tour should not turn one disputed number into certainty. The event is remembered as Bloody Thursday because lethal fire was directed into or exchanged around a civilian crowd in the country’s central political square.

The official memorial and exhibition is below the square in one of Parliament’s former ventilation tunnels. It opened in its present form in 2014, and its hours can change. The square itself has also been extensively reconstructed. As at Andrássy út 60, modern memorial design helps interpret the site but should not be mistaken for untouched physical evidence.

Kossuth Square also connects 1956 with 1989. On 23 October 1989—exactly thirty-three years after the revolution began—the Hungarian Republic was proclaimed from Parliament. The legal transition had been negotiated through talks between the ruling party and opposition groups, then enacted by the existing legislature. The first free parliamentary election followed in 1990. Hungary’s communist system ended through negotiation and institutional change, not a second armed uprising.

That does not mean 1956 had been forgotten during the intervening decades. Official language called it a counter-revolution. Families preserved different memories privately, while émigré broadcasting and underground publications challenged the state account. By 1989, the public reburial of Imre Nagy and the restoration of 23 October as a national reference point made control of the past impossible to maintain.

Take a moment to separate the dates: the uprising began on 23 October 1956; the killings here occurred on 25 October; the Soviet assault came on 4 November; and the Republic was proclaimed here on 23 October 1989.

Walk southeast to Liberty Square. In one city block you will find the Soviet war memorial and the former United States Legation—the two powers of the Cold War made physically visible.
    `, ['PARLIAMENT_KOSSUTH_SQUARE', 'PARLIAMENT_1956_MEMORIAL', 'PARLIAMENT_1989', 'MNM_1956_2000'], {
      music: { enabled: false },
      opening: 'Four seconds of present-day square ambience, then near-silence.',
      bed: 'No added music; keep the casualty discussion and 1989 transition clear.',
      avoid: 'No gunfire, panic, crowd scream or bullet-impact effect.',
    }),

    stop('liberty-square', '5. The Cold War in One City Block', `
Walk to the northern half of Liberty Square and locate the Soviet memorial, topped by a star. It commemorates Red Army soldiers killed during the fighting for Budapest in 1944 and 1945. The Soviet military defeat of Nazi Germany ended one murderous regime in Hungary, but it also placed the country under the decisive power of the Soviet Union. Both facts belong in the same account.

Now look toward the United States Embassy. During the 1956 Revolution, Cardinal József Mindszenty was released from prison. After Soviet forces attacked on 4 November, he sought asylum in the American Legation here. He remained inside for fifteen years, until 1971. A senior churchman living for a decade and a half in one diplomatic building is a concrete Cold War story: he was physically in central Budapest, legally protected by the United States and politically unusable to both sides without negotiation.

Mindszenty had opposed the communist takeover and was convicted after a show trial in 1949. Washington granted refuge but did not recognise him as holding diplomatic asylum in a way that solved his status. His presence complicated Hungarian-American relations through years in which the Kádár government was trying to stabilise itself and gain greater international acceptance. An agreement eventually allowed him to leave Hungary for Vienna.

This square can tempt guides into a simple “East versus West” tableau. The reality was more crowded. Hungary remained in the Warsaw Pact; Soviet troops stayed in the country; and the state censored media and restricted political organisation. At the same time, the Kádár system gradually relaxed some economic and cultural controls, especially after the harsh reprisals that followed 1956. Western broadcasts such as Radio Free Europe remained important sources of information, even when the authorities jammed signals and listening could be risky.

The square’s monuments were added in different periods and argue with one another. They do not form a neutral outdoor textbook. Read each inscription, note its date and ask who had the authority to place it here. That habit is more useful than assuming all memorials carry equal historical weight.

Next, continue south through central Pest to Astoria. The walk passes ordinary commercial streets—the setting in which political control and private adaptation coexisted. At Astoria, we return to the afternoon of 23 October 1956, before the uprising became an armed conflict.
    `, ['US_STATE_HUNGARY', 'BUDAPEST_INFO_LIBERTY_SQUARE', 'OSA_RFE_ARCHIVE', 'HUNGARIAN_ARCHIVES_KADAR'], {
      music: { enabled: true },
      opening: 'Start with the short CC0 music cue only; no radio-tuning or broadcast effect.',
      bed: 'Fade the cue cleanly within the opening ten seconds, well before walking directions.',
      avoid: 'No intercepted speech, Radio Free Europe clip or other added audio.',
    }),

    stop('astoria', '6. When the March Was Still Peaceful', `
Stand near Astoria and imagine the junction without today’s traffic volume. On the afternoon of 23 October 1956, a student demonstration grew into a mass movement through central Budapest. The initial march was peaceful.

Students at the Technical University had adopted sixteen demands. They called for the withdrawal of Soviet troops, a government led by Imre Nagy, free elections, freedom of speech and radio, and the removal of Stalin’s statue. The list joined national independence with political reform and practical economic grievances. It was not a single slogan imposed later on a confused crowd.

Marchers crossed to Bem Square in Buda to show solidarity with political change in Poland, then moved toward Parliament. Other groups joined along the route. Photographs near Astoria show people carrying Hungarian flags and banners expressing Polish-Hungarian solidarity. The red-white-green flag with the communist state emblem cut from its centre emerged that day as the revolution’s defining symbol. The hole was not added decoration: removing the imposed emblem turned an official flag into a political statement.

Astoria also mattered because it was a transport and information junction. People arriving from different directions exchanged news faster than the state-controlled media could explain events. Foreign visitors watched from the Astoria Hotel. Photographs made around the junction help establish that the movement was still publicly visible and broadly peaceful during this phase.

By evening, the situation had changed. At Parliament, Imre Nagy addressed the crowd. At City Park, demonstrators brought down Stalin’s statue. At the Hungarian Radio building, a delegation tried to have the sixteen points broadcast. The authorities detained delegates, and confrontation outside the building escalated into armed fighting. These events did not occur in one instant or under one command. The revolution developed through separate crowds, incomplete information and rapidly shifting decisions.

A useful fact about censorship: one of the students’ explicit demands concerned free radio. They understood that control of broadcasting was not secondary to political power. If the state alone could define what was happening, it could label a demonstration a conspiracy before most citizens heard the demonstrators’ case.

From Astoria, walk south along Múzeum Boulevard, then turn into Bródy Sándor Street toward the former Hungarian Radio headquarters. Stay on the pavement and watch for traffic. The next stop is where a demand to broadcast words became a battle over the building that transmitted them.
    `, ['MNM_ASTORIA', 'TERROR_HOUSE_RADIO'], {
      music: { enabled: true },
      opening: 'Start with the short CC0 music cue only; no street or tram effect.',
      bed: 'Fade the cue cleanly within the opening ten seconds, well before walking directions.',
      avoid: 'No invented crowd chant, archival crowd audio or other added audio.',
    }),

    stop('hungarian-radio', '7. Sixteen Points and the Fight for the Radio', `
Pause on Bródy Sándor Street near the former Hungarian Radio building. In 1956 this was not just a workplace for journalists and technicians. State radio was the fastest national medium and a central instrument of political control.

On 23 October, student representatives entered the building to request that their sixteen demands be broadcast. The authorities did not put the list on air. The delegation was detained, while the crowd outside demanded its release. Tension rose, armed security forces were present, and fighting began around the building that evening. Sources differ on some details of the first shots, so it is safer to describe the documented sequence than to assign a cinematic single trigger.

The battle for the Radio turned a mass demonstration into armed revolution. Weapons reached protesters from soldiers, police stations and factories; some members of the security forces changed sides. The building and neighbouring streets were heavily contested. The struggle was political and technical at once: whoever controlled the transmitter could claim to speak for the country.

Even after revolutionaries occupied the main building, broadcasting was not as simple as switching on a microphone. Facilities had been damaged, and state radio used more than one studio and transmitter. During the following days, programming operated from other locations, including a studio in Parliament. Stations changed names and loyalties as authority fragmented.

Radio also connected Hungary to the wider Cold War. Western stations, especially Radio Free Europe and Voice of America, broadcast news across the Iron Curtain. Hungarian authorities jammed signals, producing the characteristic interference older listeners still remember. Those broadcasts supplied information unavailable in the official press, but they were not all-knowing. Reports could be delayed, incomplete or based on uncertain accounts from a city in combat.

Notice the narrow street. This was not an open battlefield designed for tanks and crowds. Residents, museum staff and passers-by were trapped beside a strategic target. The Hungarian National Museum stands only a few minutes away, and fire from the fighting damaged its collections.

Do not add gunshot effects to this chapter. The location already carries the fact of lethal violence; simulated shots turn uncertainty and death into entertainment.

Walk back toward Múzeum Boulevard and enter the garden of the Hungarian National Museum if it is open. Our next chapter follows an unusually well-documented form of collateral damage: a national collection burning beside the battle for the airwaves.
    `, ['TERROR_HOUSE_RADIO', 'MNM_MUSEUM_FIRE'], {
      music: { enabled: false },
      opening: 'No added music or effects; begin with direct narration.',
      bed: 'No added score or electrical texture.',
      avoid: 'No gunfire or combat reconstruction. Any period broadcast must be rights-cleared and identified by date and station.',
    }),

    stop('national-museum', '8. The Museum Caught in the Crossfire', `
Stand in the National Museum garden and look toward Bródy Sándor Street. The Radio building is close enough that fighting there reached this museum almost immediately.

Between 24 and 26 October 1956, fire broke out in parts of the museum complex. Staff and volunteers tried to protect the building while armed combat continued nearby. The damage was not limited to broken windows or scorched walls. The museum’s natural history collections suffered heavily. According to the museum’s own account, roughly two-thirds of its mineral, rock and meteorite collection was destroyed. Parts of the Africa exhibition, library material and other holdings were also lost or damaged.

That statistic makes the cost unusually tangible. Political violence did not only kill people and damage state buildings; it erased scientific specimens and records accumulated over generations. Some objects were irreplaceable because there was no second copy to retrieve after the fire.

The institution itself had already carried earlier revolutionary meaning. In March 1848, crowds gathered here during Hungary’s reform revolution. In 1956, that national symbolism did not protect it from crossfire. Buildings do not choose the history attached to them, and famous civic sites can become vulnerable simply because a strategic target stands next door.

Museum workers faced practical decisions rather than heroic tableaux: which rooms could be reached, what could be moved, where water was available and when continued rescue became too dangerous. We should avoid inventing dialogue or individual feats unless a documented testimony supports them. The verified loss is powerful enough.

The episode also complicates a clean map of “revolutionaries here, regime there.” Dense city fighting put homes, schools, archives and collections between armed positions. Soviet forces withdrew from central Budapest at the end of October, then returned in overwhelming strength on 4 November. Damage continued across the city even where no major political institution stood.

Listen to the ordinary sound of the garden. It is better than a fire effect. The contrast between a functioning museum and the documented destruction tells the story without pretending to reproduce it.

For the final stop, walk southeast to Corvin Passage. The route follows the Grand Boulevard toward one of the most important armed resistance centres of 1956. There we will cover the fighters, the Soviet assault and the quieter system that followed defeat.
    `, ['MNM_MUSEUM_FIRE', 'MNM_CORVIN'], {
      music: { enabled: false },
      opening: 'No added music or effects; let the narration stand on its own.',
      bed: 'No added score, especially beneath the collection-loss figures.',
      avoid: 'No flames, siren montage or collapsing-building effect.',
    }),

    stop('corvin-passage', '9. Corvin Passage: Resistance, Reprisals, Afterlife', `
Enter Corvin Passage from the Grand Boulevard and notice the shape of the space: narrow entrances, connected courtyards and surrounding buildings. In October 1956, that layout gave armed groups cover and control over approaches. Corvin became one of the revolution’s most important resistance centres.

Many fighters were young workers, apprentices and students rather than professional soldiers. They used rifles, machine guns, grenades and petrol bombs. In close streets, small groups could attack armoured vehicles from windows and doorways, then move through courtyards. Some Hungarian soldiers joined them or supplied weapons. The resistance was decentralised; “the Corvin group” contained shifting units and leaders rather than a perfectly organised army.

Fighting here was intense from 24 October. A temporary ceasefire and Soviet withdrawal at the end of the month created a short interval in which victory seemed possible. On 4 November, the Soviet Union launched a much larger assault. Imre Nagy’s early-morning radio message announced the attack. Resistance at Corvin and other points continued for days, but it could not defeat the forces deployed against Budapest.

Defeat was followed by arrests, prison sentences and executions. The new government led by János Kádár depended initially on Soviet military power. Repression was severe, while about two hundred thousand people left Hungary after the revolution. An amnesty in 1963 released many prisoners, but it did not erase convictions, surveillance or the pressure on former participants and their families.

Over time, Kádár’s system became less openly terror-driven than the Stalinist period. Limited consumer choice, economic reforms and more room for private life produced the later nickname “goulash communism.” The phrase can be useful, but only if it does not turn political restriction into a cosy brand. Hungary remained a one-party state inside the Soviet alliance. Careers, publishing, travel and public speech still had boundaries, even when daily life was more predictable than in the early 1950s.

Corvin Passage itself was later rebuilt and commercialised. Shops and a cinema now occupy a place associated with street combat. Look for memorial plaques rather than expecting the 1956 streetscape to have survived unchanged.

This tour began with a secret-police headquarters and ends in an ordinary commercial passage. That is the useful scale for Cold War history: institutions, streets and individual choices operating together. The system did not collapse in one dramatic night. By 1989, economic pressure, political negotiation, changing Soviet policy and the recovered public memory of 1956 had made one-party rule untenable.

End the audio here. Leave a few seconds to read the names on the memorials before returning to the boulevard.
    `, ['MNM_CORVIN', 'MNM_NAGY_BROADCAST', 'NEB_REPRESSION', 'HUNGARIAN_ARCHIVES_KADAR', 'UNHCR_1956'], {
      music: { enabled: false },
      opening: 'No added music or effects; begin with direct narration.',
      bed: 'No added score through the fighting, reprisals and final reflection.',
      avoid: 'No gunfire, explosions, tank sounds or victory music.',
    }),
  ],
};
