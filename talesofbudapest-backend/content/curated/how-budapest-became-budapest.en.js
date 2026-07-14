import {
  CURATED_TOUR_SLUG,
  CURATED_TOUR_VERSION,
  STOP_COORDINATES,
  WALKING_ROUTE,
} from './how-budapest-became-budapest.common.js';

const stop = (key, title, script, sourceIds, extra = {}) => ({
  key,
  title,
  ...STOP_COORDINATES[key],
  script: script.trim(),
  sourceIds,
  observationMinutes: extra.observationMinutes ?? 5,
  ...extra,
});

export const TOUR_EN = {
  slug: CURATED_TOUR_SLUG,
  version: CURATED_TOUR_VERSION,
  locale: 'en',
  title: 'How Budapest Became Budapest',
  tagline: 'About 2¼ h · nine turning points by the Danube',
  description: 'A first-day walk through the choices, ambitions and ruptures that made modern Budapest.',
  walkingRoute: WALKING_ROUTE,
  stops: [
    stop('deak-anker', '1. A City with Three Birthplaces', `
Stand where you can see the broad traffic junction of Deák Ferenc Square and the pale, many-windowed mass of Anker Palace. This is a useful place to begin because Budapest does not reveal itself from a single monument. It behaves more like a set of layers laid over one another.

First, find your bearings. The Danube is a few minutes downhill to the west. Beyond it rise the Buda Hills, crowned by the Castle District. You are standing in Pest, the flatter, busier half of the capital. Farther north, beyond the centre, lies Óbuda, or Old Buda. For centuries these were separate settlements with different rhythms: royal and administrative Buda, commercial Pest, and the older town of Óbuda. They were formally united in 1873. That date did not create urban life from nothing, but it gave one government and one name to a rapidly expanding metropolis.

The square is named for Ferenc Deák, the statesman associated with the political compromise of 1867 that created Austria-Hungary. Hungarians often call him “the Wise Man of the Nation.” His age believed that laws, institutions, bridges and boulevards could reshape the country. The city around you is one result of that confidence.

Now look at Anker Palace. The present building was designed by Ignác Alpár and completed in the early twentieth century for the Anker insurance company. Its towers and busy façade make a theatrical gateway between the historic centre and the avenues beyond. It is not ancient Budapest; it is Budapest presenting itself as a modern European capital.

You will hear two words repeatedly on this walk: Buda and Pest. Hungarian pronounces the city roughly as “Boo-dah-pesht,” with the stress on the first syllable. Hungarian itself belongs to the Uralic language family, unlike the Indo-European languages spoken by most neighbouring peoples. Language became an especially powerful marker of national culture during the nineteenth century, when institutions, literature and public life increasingly operated in Hungarian.

This tour follows one question: how did three towns become the city in front of you? The answer will involve reformers, engineers, architects and café owners—but also war, dictatorship and the difficult work of remembrance. When you are ready, walk toward the dome of St Stephen’s Basilica. Watch how the small streets suddenly frame an enormous building. Budapest loves that kind of reveal.
    `, ['S01', 'S02', 'S03']),

    stop('st-stephens', '2. A Crown, a Dome and a New Capital', `
Move into the centre of the square and let the Basilica fill your view. Its size is deliberate. In the nineteenth century, Pest was growing at extraordinary speed, and the new districts needed a church that could match the ambitions of the city.

Construction began in 1851 from plans by József Hild. The project then suffered a spectacular setback: in 1868, defects in the structure caused the partially built dome to collapse. No congregation was inside. Miklós Ybl, one of Hungary’s most important architects, took over, reassessed the structure and redesigned major parts in a more Renaissance-inspired form. After Ybl’s death, József Kauser completed the interior. The church was consecrated in 1905, more than half a century after work began.

The long building story is a miniature version of Budapest’s own transformation—optimistic, interrupted, redesigned and finally completed on a grander scale. Notice the two bell towers and the deep portico, then lift your eyes to the dome. Its height is about ninety-six metres, traditionally given as the same symbolic height as the Parliament. In the skyline, church and legislature face one another as two great institutions of Hungarian public life.

The Basilica is named for Stephen I, crowned around the year 1000 and remembered as the first king of the Christian Kingdom of Hungary. His reign tied the new kingdom to Latin Christianity and to the political order of medieval Europe. Later generations made him a central figure of Hungarian statehood. The object known as the Holy Right—the mummified right hand attributed to Stephen—is kept inside the church as a national and religious relic.

It is important to separate what can be historically established from what belongs to devotion. Stephen’s reign, laws and church foundations are matters of history. The identity and journey of a thousand-year-old relic pass through medieval tradition and later documentation. A good guide does not need to diminish belief, but should not turn tradition into laboratory certainty either.

Before leaving, look around the square rather than only at the church. The cafés, terraces and carefully restored façades show how a sacred building also anchors ordinary city life. Budapest’s monuments rarely stand apart from eating, meeting and conversation.

From here, continue north-west toward Liberty Square. As you walk, notice how the Basilica disappears behind you and the financial and governmental city takes over. In only a few blocks, Budapest changes its vocabulary from faith to money, power and memory.
    `, ['S04', 'S05', 'S06']),

    stop('liberty-square', '3. Liberty Square and the Argument over Memory', `
Liberty Square is elegant, green and unusually difficult to explain in a single sentence. That is precisely why it matters. The buildings and monuments around you do not tell one harmonious story. They argue with one another.

The square occupies ground once dominated by the Neugebäude, a vast Habsburg military complex and prison. Count Lajos Batthyány, the first prime minister of responsible Hungarian government, was executed within that complex in 1849 after the defeat of the revolution. The barracks were demolished at the end of the nineteenth century, and the area was rebuilt as part of the modern financial district. The former Stock Exchange palace and the Hungarian National Bank express the confidence of the late imperial capital.

Near the northern end stands the Soviet war memorial, dedicated to Soviet soldiers who died in the fighting for Budapest in 1944–45. The Red Army helped end Nazi German rule and the Arrow Cross terror. It also brought Hungary under Soviet military dominance, followed by a communist dictatorship. Both statements are historically necessary. Using only the word liberation or only the word occupation leaves part of the story out.

At the southern edge, the memorial to the victims of the German occupation depicts the Archangel Gabriel, representing Hungary, beneath an attacking imperial eagle. Germany occupied its ally Hungary on 19 March 1944. The occupation was a decisive escalation: Hungarian authorities then participated in the extraordinarily rapid ghettoisation and deportation of hundreds of thousands of Hungarian Jews. Critics of the monument argue that its imagery presents Hungary only as an innocent victim and obscures the responsibility of Hungarian institutions and collaborators.

In response, citizens created an informal counter-memorial in front of it. Photographs, stones, handwritten histories and personal objects insist on individual lives and on a more complicated account of responsibility. The installation changes over time, so describe only what you can actually see today.

This is not a stop where a guide should hand you a neat verdict. Instead, examine the spatial argument. A Soviet monument, an American embassy, a memorial sponsored by the Hungarian state and a citizens’ counter-memorial occupy the same square. Each asks who was victim, who was liberator, who was occupier and who must accept responsibility.

Public space is one of Budapest’s historical archives. It is also an active political language. As you leave toward Parliament, carry that uncertainty with you. The next square was designed to project national confidence, yet it too became a place where the state and its citizens confronted one another.
    `, ['S07', 'S08', 'S09', 'S10']),

    stop('parliament-kossuth', '4. Parliament: Building the Nation in Stone', `
Walk far enough into Kossuth Square to see the Parliament’s long river façade and central dome. The building seems inevitable now, but it was the product of a particular political moment.

After the Compromise of 1867, Hungary possessed its own parliament and government within the Dual Monarchy. Buda, Pest and Óbuda united in 1873, and the new capital needed a permanent legislature worthy of its status. A design competition was launched in the 1880s. Imre Steindl’s neo-Gothic proposal won. Construction began in 1885, the building was inaugurated during the millennium celebrations of 1896, and work was completed in 1904. Steindl died in 1902 and did not live to see the finished building.

The Gothic language evokes historic European parliaments, especially Westminster, but the composition is not a copy. The symmetrical plan reflects the two-chamber legislature of the period. The dome rises at the centre, where the two halves meet. Stone carving, stained glass, metalwork, painting and sculpture turned the project into a showcase for Hungarian crafts and industry. The building’s scale announced that Budapest no longer saw itself as a provincial city.

Inside, the Holy Crown of Hungary is displayed beneath the dome. The crown’s history is complex: it is traditionally called the Crown of St Stephen, although its surviving components date from later centuries. Again, national symbolism and strict object history do not always fit into the same sentence.

The square also carries the memory of 25 October 1956. During the uprising against communist rule and Soviet domination, an unarmed crowd gathered here. Gunfire killed and wounded many people. The exact sequence of fire and the precise number of victims remain subjects of historical investigation, so responsible narration avoids a falsely exact death toll. What is established is that the violence at Kossuth Square became one of the uprising’s defining traumas.

Look at the square as a stage. It has been repeatedly redesigned as governments changed the way national history should appear. Statues were installed, removed and returned; memorials shifted; the surface itself was reconstructed. Parliament is stable in postcard images, but the political landscape around it has never stopped moving.

Before heading to the river, turn once toward the dome. It is beautiful, but beauty here is also an argument: about constitutional government, national continuity and the place Hungary wished to occupy in Europe. Now walk south along the embankment to a memorial that uses no dome, no heroic figure and almost no words.
    `, ['S11', 'S12', 'S13', 'S14']),

    stop('shoes-danube', '5. The Shoes on the Danube Bank', `
Please approach quietly and leave space for other visitors. The sixty pairs of iron shoes were conceived by film director Can Togay and made with sculptor Gyula Pauer. The memorial was inaugurated in 2005. Its subject is the people murdered on the Budapest riverbank by members of the Hungarian Arrow Cross movement in 1944 and 1945.

After Nazi Germany occupied Hungary in March 1944, Hungarian authorities collaborated in the persecution, ghettoisation and deportation of the country’s Jewish population. In October, the Arrow Cross Party seized power. Its armed men terrorised Budapest, forced thousands on death marches and murdered people in streets, hospitals and beside the Danube. At the river, victims were sometimes ordered to remove their shoes before being shot. Shoes were valuable wartime property. The current carried bodies away.

The memorial does not recreate identifiable victims. The footwear is modelled in period styles—men’s work shoes, elegant women’s shoes and children’s shoes—so absence becomes the central image. This distinction matters: we should not invent a name, a final conversation or a personal biography for any particular pair.

You may see stones, candles or flowers placed in and around the shoes. These are acts of remembrance left by visitors. Do not move them. The three plaques state in Hungarian, English and Hebrew that the memorial honours victims shot into the Danube by Arrow Cross militiamen in 1944–45.

The location creates a difficult contrast. Parliament stands only a short walk away; Buda Castle rises across the water; river traffic continues as normal. The memorial asks how mass violence could occur within the everyday geography of a capital city. It also makes Hungarian responsibility explicit. German occupation was crucial to the Holocaust in Hungary, but the gunmen commemorated here belonged to a Hungarian fascist movement.

There is no uplifting conclusion required at this stop. If it feels appropriate, pause the audio now and remain silent for a moment.

When you are ready to continue, walk south toward the Hungarian Academy of Sciences and the Chain Bridge. The next chapter returns to the nineteenth-century reformers who imagined that connection—between language and knowledge, between two riverbanks, and between privilege and public responsibility—could change the country.
    `, ['S15', 'S16', 'S17']),

    stop('academy-chain-bridge', '6. Széchenyi and the Architecture of Reform', `
Stand where you can take in the Hungarian Academy of Sciences and, beyond the square, the Chain Bridge. These two landmarks share more than a famous name. Together they express the programme of Count István Széchenyi, one of the central reformers of nineteenth-century Hungary.

At the Diet in Pozsony—today Bratislava—on 3 November 1825, Széchenyi offered one year of income from his estates to support a learned society. Other magnates joined him. The institution that became the Hungarian Academy of Sciences was created to advance knowledge and cultivate Hungarian as a language of scholarship. Its palace opened in 1865. Designed by the Prussian architect Friedrich August Stüler, it became one of Pest’s early monumental neo-Renaissance buildings.

Now turn toward the bridge. Before it opened, crossing the Danube depended on boats, ferries and a seasonal pontoon bridge. Ice, flood and weather could sever the connection. Széchenyi became the leading political force behind a permanent bridge. The English engineer William Tierney Clark designed it, while the Scottish engineer Adam Clark supervised construction on site. They shared a surname but were not related.

Work began in 1839 and the bridge opened in November 1849, after the revolution and war of independence had been defeated. Széchenyi, by then confined to an institution at Döbling, never walked across the completed bridge. The structure linked Buda and Pest decades before their administrative union.

The bridge also challenged noble privilege. Hungarian nobles traditionally claimed exemption from many public taxes and tolls. The bridge’s legal arrangements required users, including nobles, to pay. That made it a practical crossing and a political symbol: modern infrastructure would be a shared responsibility.

Retreating German forces destroyed the bridge in January 1945 along with Budapest’s other Danube crossings. It was rebuilt and reopened on 20 November 1949, exactly a century after its first opening. Its present form therefore carries both nineteenth-century design and twentieth-century reconstruction.

Look across to Castle Hill. From here, Buda appears close enough to touch, yet the river once marked a serious physical and social separation. The bridge did not by itself create Budapest, but it made a united city imaginable in daily life.

As you continue around the square, notice how reform took architectural form: an academy for language and science, a bridge for movement and commerce, and public space designed to display both. Your next stop, Gresham Palace, shows what happened when those reforms helped produce an international commercial metropolis.
    `, ['S18', 'S19', 'S20']),

    stop('gresham-palace', '7. Gresham Palace and the Golden-Age City', `
Face the curving façade of Gresham Palace and look for peacocks, floral patterns, mosaics and wrought iron. This is Budapest at the beginning of the twentieth century: prosperous, technically confident and eager to turn commerce into art.

The site previously held the Nákó House, where business and fashionable society met. The British Gresham Life Assurance Company commissioned the present building as offices and luxury apartments. It was designed by Zsigmond Quittner with the Vágó brothers and completed in 1906. The name refers to Sir Thomas Gresham, the sixteenth-century English financier associated with London’s Royal Exchange.

The building belongs to the Hungarian branch of Art Nouveau, often called Secession. Rather than treating ornament as a detachable decoration, its designers coordinated architecture, ironwork, glass, ceramics and furniture. The passage through the centre once allowed carriages to enter, while shops, offices and apartments brought different parts of metropolitan life under one roof.

This elegance was supported by the networks created in the previous chapter: bridges, railways, banks, insurance, a growing middle class and a city government determined to modernise. Budapest’s population multiplied during the decades around unification. Grand buildings were not only aesthetic achievements; they were advertisements for institutions competing in a booming capital.

The twentieth century was less gentle. Gresham suffered damage during the siege of Budapest. Under state ownership in the socialist period, it was divided into apartments and offices, and its condition deteriorated. A major restoration around the turn of the twenty-first century converted it into a hotel. The project recovered much surviving decorative work and recreated lost elements, while also changing the building’s use and social accessibility.

That tension is worth noticing. Restoration can save architecture, skilled craft and urban memory. It can also turn a once mixed-use building into an expensive space most residents experience only from outside. Cities preserve history through present-day economic choices, never in a vacuum.

Move close enough to study one detail rather than photographing the whole façade. Find a peacock, a curve of iron or a piece of coloured mosaic. The “golden age” becomes more understandable when you see the labour embedded in it.

From here walk toward Vörösmarty Square. The next stop moves from insurance and investment to another institution of modern Budapest: the café, where business, literature, gossip and the performance of urban life occupied neighbouring tables.
    `, ['S21', 'S22', 'S23']),

    stop('vorosmarty-gerbeaud', '8. The Café as a Public Living Room', `
Vörösmarty Square is less solemn than the stops you have just visited, but it belongs to the same history. A modern capital needs more than government buildings. It needs places where people meet, argue, read, display themselves and learn the unwritten rules of city life.

The square is named for Mihály Vörösmarty, a major nineteenth-century poet and dramatist. His “Szózat,” written in 1836, became one of Hungary’s most important patriotic poems. Its opening addresses the Hungarian directly and binds personal loyalty to homeland. You do not need to speak Hungarian to understand why literature mattered so much in a culture where language carried political meaning.

On the square stands Café Gerbeaud. Its predecessor was founded by Henrik Kugler in 1858 and moved here in 1870. The Swiss-born confectioner Emil Gerbeaud joined the business in the 1880s and expanded its production and reputation. Fine cakes, chocolates and elaborate interiors made the café a destination, but cafés were not simply places to consume luxury.

Budapest’s coffeehouses served as reading rooms, offices, clubs and informal news exchanges. Newspapers were available; writers could spend hours at a table; editors, actors, lawyers and merchants built professional networks. Different cafés attracted different communities. The most famous literary stories belong to places elsewhere in Pest, but Gerbeaud shows the polished, cosmopolitan face of the same coffeehouse culture.

Look at the flows around the square. Váci Street brings shoppers from one direction, the Danube lies close by, and the historic metro and tram network connect the centre to neighbourhoods far beyond it. A successful public square works as an intersection of routines, not merely as a frame for a statue.

Food traditions are often presented to visitors as timeless folklore. In reality they are shaped by technology, trade and fashion. Nineteenth-century confectionery depended on imported ingredients, specialised equipment, trained labour and customers with disposable income. A cake can therefore tell a story about empire and urbanisation just as surely as a façade can.

This is also a practical moment in the tour. If you order in Hungarian, “köszönöm” means thank you. A simple “jó napot” is a polite daytime greeting. Do not worry about perfect pronunciation; the gesture matters more than performance.

For the final stop, walk toward the Danube and the Vigadó. We will end not with another list of dates, but by reading the skyline and gathering the nine chapters into one view.
    `, ['S24', 'S25', 'S26']),

    stop('vigado-promenade', '9. Reading Budapest from the River', `
Stand on the promenade with the Vigadó behind or beside you and the Buda bank across the river. The current Vigadó concert hall was designed by Frigyes Feszl and opened in 1865. Its architecture does not fit neatly into a single imported style; Moorish, Romanesque and distinctly Hungarian aspirations mix across the façade. It replaced an earlier concert building damaged during the revolution of 1848–49.

The Vigadó became a setting for concerts, balls, ceremonies and exhibitions. Like the Academy, the bridge and the cafés, it was part of the cultural infrastructure of a capital in the making. It too was badly damaged in the Second World War and later reconstructed. Once again, the building in front of you is both a nineteenth-century creation and a survivor shaped by twentieth-century repair.

Now turn to the panorama. Castle Hill represents the long history of royal Buda. The flat bank where you are standing represents commercial Pest and its spectacular nineteenth-century growth. The Chain Bridge marks the reformers’ determination to connect them. Parliament announces the political ambition of the united city. Domes, towers, hotels, apartment houses and embankments show successive generations negotiating with the same river.

Budapest became one municipality in 1873, but the city on this walk was never made in a single year. Stephen’s medieval kingdom supplied symbols of statehood. Reformers promoted language, knowledge and shared infrastructure. The Dual Monarchy created political conditions and capital for enormous urban expansion. Architects gave institutions memorable forms. War and dictatorship destroyed lives and buildings. Later generations rebuilt, restored, disputed and memorialised what remained.

That last verb—disputed—is important. Liberty Square demonstrates that memory is not a finished monument. Kossuth Square shows that national space changes with politics. The Shoes memorial shows how absence can challenge official grandeur. Gresham Palace asks who benefits when heritage is restored. Budapest is most interesting when its beauty and its contradictions remain visible together.

Take a final moment to choose one detail you would not have noticed before the walk: the equal toll implied by a bridge, the changing function of a palace, the argument between two memorials, or the deliberate relationship between a dome and a skyline. Knowledgeable travel is not the ability to recite every date. It is the ability to see more structure in what is already in front of you.

From here, the tram along the river, the Chain Bridge, the central metro stations and the restaurants of downtown Pest are all within easy reach. Buda Castle deserves its own unhurried visit rather than a rushed ending to this tour.

You began among three former towns and end facing both banks of one capital. That is how Budapest became Budapest: not through a single founder or legend, but through connections repeatedly built, broken and made again.
    `, ['S27', 'S28', 'S01', 'S29']),
  ],
};
