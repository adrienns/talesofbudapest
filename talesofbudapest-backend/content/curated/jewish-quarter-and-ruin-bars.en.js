import {
  CURATED_TOUR_SLUG,
  CURATED_TOUR_VERSION,
  CURATED_IMAGE_URLS,
  LOCATION_SLUGS,
  SOURCES,
  STOP_COORDINATES,
  WALKING_ROUTE,
} from './jewish-quarter-and-ruin-bars.common.js';

const stop = (key, title, script, sourceIds, extra = {}) => ({
  key,
  locationSlug: LOCATION_SLUGS[key],
  title,
  ...STOP_COORDINATES[key],
  script: script.trim(),
  sourceIds,
  observationMinutes: extra.observationMinutes ?? 5,
  ...extra,
});

export const JEWISH_QUARTER_TOUR_EN = {
  slug: CURATED_TOUR_SLUG,
  version: CURATED_TOUR_VERSION,
  locale: 'en',
  title: 'Jewish Quarter and Ruin Bars',
  tagline: 'About 1¾ h · nine layers of faith, survival and nightlife',
  description: 'A clear-eyed walk through Jewish Pest, the 1944 ghetto and the courtyards that became Budapest’s ruin-bar district.',
  walkingRoute: WALKING_ROUTE,
  walkingDistanceRangeMeters: [2500, 3500],
  scriptWordRange: [260, 550],
  sources: SOURCES,
  stops: [
    stop('orczy-house', '1. The Jewish Quarter Before It Had a Name', `
Stand near the meeting of Károly Boulevard and Király Street, facing the monumental brick arches of Madách Square. The best place to begin this tour is with a building that is no longer here.

Before the Madách complex, this corner was occupied by the Orczy House, an enormous courtyard building that became the practical centre of Jewish life in Pest. Until the late eighteenth century, Jews were generally not permitted to settle inside Pest’s city walls. Merchants could trade in the city, then had to live beyond its gates. Király Street began just outside that boundary and led toward the main road to Vienna, so it was a useful address for people whose livelihoods depended on movement and markets.

The Orczy House was more than housing. At different points it contained prayer rooms, ritual facilities, shops, warehouses and a café. The leather trade was especially important, and the courtyard also functioned as a place to exchange news and find work. Hundreds of residents and visitors passed through a space that was religious centre, commercial hub and social network at the same time.

This matters because the historic Jewish Quarter was not originally a sealed ghetto. It developed gradually through settlement, business, family connections and proximity to communal institutions. Jews lived among non-Jewish neighbours, and the district was always more mixed than its modern label suggests. The closed ghetto came much later, under the Arrow Cross regime in 1944, and lasted only the final, catastrophic weeks of the war.

The Orczy House disappeared during the twentieth-century redevelopment that produced the structures around Madách Square. Its absence is a useful warning: cities do not preserve every origin story in stone. Sometimes the street pattern and the location of later institutions are the evidence.

Walk east along Rumbach Sebestyén Street. As the traffic noise fades, look for two slender towers and a striped, richly patterned façade. The next building records a different kind of history: not one united form of Judaism, but a community debating how tradition should meet modern life.
    `, ['YIVO_BUDAPEST', 'OPEN_HERITAGE'], CURATED_IMAGE_URLS['orczy-house']),

    stop('rumbach-synagogue', '2. Rumbach and the Middle Path', `
Look closely at the Rumbach Street Synagogue before deciding what style it belongs to. Its red and yellow masonry, horseshoe arches and geometric ornament are usually described as Moorish Revival. Behind the narrow street façade, the prayer hall is organised around an octagonal space. The effect is both historic-looking and technically modern.

The synagogue was built between 1869 and 1872 from designs by Otto Wagner. Wagner was still early in a career that would later make him one of Vienna’s great architects of modernity. Here he used a light structural system and a tightly planned urban site to create an interior that feels much larger than the entrance suggests.

The building is one point of what guides call Budapest’s synagogue triangle. Dohány Street represented Neolog Judaism, which accepted significant reforms in worship and strongly identified with Hungarian civic life. Kazinczy Street later became the centre of the Orthodox community. Rumbach is associated with the Status Quo Ante tendency: communities that did not want to join either of the national organisations formed after the Jewish Congress of 1868 and 1869.

Those labels require care. They were not simply levels from “modern” to “traditional,” and individual beliefs never fit perfectly inside institutional boxes. The important point is that nineteenth-century Hungarian Jews were actively negotiating language, ritual, architecture, education and belonging. The three synagogues are close enough to walk between in minutes, yet they embody different answers.

Rumbach’s later history was difficult. Its community was devastated by the Holocaust, the building lost its regular role, and it stood neglected for decades. A major restoration completed in 2021 returned the extraordinary colour of the interior and gave the space religious, museum and cultural functions. Preservation here did not mean pretending nothing had happened; it meant finding a viable use for a building whose original congregation could not simply be recreated.

Continue toward Dohány Street. The next synagogue is much larger and more famous, but use Rumbach as a reference point. Monumental Jewish architecture in Pest did not speak with one voice.
    `, ['RUMBACH_OFFICIAL', 'MAZSIHISZ_GUIDE'], CURATED_IMAGE_URLS['rumbach-synagogue']),

    stop('dohany-synagogue', '3. A Synagogue Built for a Metropolis', `
Move far enough back to see both onion-domed towers of the Dohány Street Synagogue. When it was consecrated in 1859, Budapest did not yet exist as a united city; this was Pest, expanding quickly and imagining its metropolitan future.

The synagogue was designed by the Vienna-based architect Ludwig Förster, with important interior work by the Hungarian architect Frigyes Feszl. It can hold close to three thousand worshippers and is widely described as Europe’s largest synagogue. Scale was part of the message. The Pest Jewish community was growing, economically important and increasingly visible in Hungarian public life. This was not an invisible backstreet chapel. It was an urban monument.

Dohány served the Neolog community. Features such as an organ, a choir and a sermon delivered in the language of the wider society reflected forms of worship shaped by nineteenth-century reform. The Moorish-inspired exterior is another piece of that story. European synagogue architects often used an imagined “Oriental” vocabulary to make Jewish buildings distinct from churches. What looks exotic today was also a debate in brick about identity and belonging.

The site holds an unexpected biographical detail. Theodor Herzl, who later became the leading figure of political Zionism, was born in 1860 in a house next to the synagogue. The Hungarian Jewish Museum now occupies that part of the complex. A child raised beside one of Europe’s grandest urban synagogues would later argue that Jews needed a sovereign national home.

The courtyard tells a far darker story. Jewish burial grounds are normally separate from synagogues, but during the Budapest ghetto there was no safe way to carry the dead to a cemetery. Thousands were buried here out of necessity. The memorial garden and metal weeping willow commemorate Hungarian Jewish victims of the Holocaust.

You do not need to enter for this chapter, and opening hours change around Saturdays and Jewish holidays. From the façade, walk north along Dohány Street, then turn toward the small Carl Lutz memorial on Dob Street. The tour now moves from nineteenth-century confidence to the moral improvisation required in 1944.
    `, ['DOHANY_OFFICIAL', 'JEWISH_MUSEUM_DOHANY'], CURATED_IMAGE_URLS['dohany-synagogue']),

    stop('carl-lutz-memorial', '4. Carl Lutz and the Paper Shield', `
This memorial occupies a narrow break in the street rather than a ceremonial square. That scale suits the story. Carl Lutz was a Swiss vice-consul, not a general, and his main tools were negotiation, stamps, lists and the fragile authority of diplomatic paper.

After Germany occupied Hungary on 19 March 1944, the persecution of Hungarian Jews accelerated with the active participation of Hungarian authorities. Deportations from the provinces sent hundreds of thousands to Auschwitz-Birkenau. Budapest’s Jews were first forced into designated yellow-star houses scattered across the city. After the Arrow Cross seized power in October, murder, forced marches and ghettoisation intensified.

Lutz had represented foreign interests in Budapest and worked with Jewish organisations on emigration to Palestine. In 1944 he used that experience to issue Swiss protective documents. He stretched the agreed quotas through numbering practices and by treating permissions as covering families, not merely individuals. Buildings connected with the Swiss operation were declared protected, most famously the Glass House on Vadász Street.

The rescue effort was never the work of one lone diplomat. Gertrud Lutz, other Swiss officials, Zionist youth activists and Hungarian Jewish organisers produced documents, distributed them, maintained safe houses and sometimes pulled people out of immediate danger. The paperwork could fail at any checkpoint. Its power depended on whether an armed man chose to recognise it, and on continued negotiation with both German and Hungarian officials.

Estimates vary, so a responsible account avoids turning rescue into a contest of exact numbers. What is clear is that the Swiss operation contributed to the survival of tens of thousands of people. Lutz was later recognised by Yad Vashem as Righteous Among the Nations.

Notice how the memorial fits into an ordinary residential street. Rescue and persecution took place in offices, courtyards, tram stops and doorways—not in a separate landscape labelled “history.” Continue north toward Klauzál Square. On the way, look at the apartment entrances. Many buildings in this district were once inside the closed ghetto; others were designated yellow-star houses during the earlier phase of forced relocation.
    `, ['USHMM_BUDAPEST', 'CARL_LUTZ_SOCIETY', 'YELLOW_STAR_HOUSES'], CURATED_IMAGE_URLS['carl-lutz-memorial']),

    stop('klauzal-square', '5. Klauzál Square Inside the Ghetto', `
Klauzál Square usually feels domestic: trees, benches, dogs, children and the market hall along one side. That ordinary character is precisely why this stop needs careful attention.

Before the war, the square was part of a dense commercial neighbourhood. The market hall opened at the end of the nineteenth century, bringing food retail under a modern iron-and-brick roof. Jewish and non-Jewish residents shopped, worked and met in the streets around it. The district’s history was made as much by grocers, tailors, teachers and children as by famous rabbis or architects.

The sequence of 1944 is important. After the German occupation in March, Budapest Jews faced escalating restrictions. In June, Hungarian authorities ordered them into nearly two thousand designated yellow-star houses spread through the capital. This was not yet the closed ghetto. Following the Arrow Cross takeover in October, the remaining population was forced into a sealed area in this part of District Seven. The ghetto was established late in November and existed until January 1945.

Tens of thousands of people were compressed into a few blocks during the siege of Budapest. Food, water, medicine and heating were desperately scarce. Buildings were overcrowded and damaged by fighting. Klauzál Square became a place where bodies were gathered because normal burial was impossible. Many of the dead were later buried in the emergency cemetery beside the Dohány Street Synagogue.

Avoid the comforting idea that survival was simply a matter of waiting for liberation. People survived through mutual aid, concealment, forged papers, protected houses, chance and the rapid military collapse of the regime; many others did not. German occupation was decisive, but Hungarian laws, officials, gendarmes and Arrow Cross militiamen were central to the persecution and murder.

Pause here without trying to imagine cinematic scenes or invent individual stories. The verified facts are enough. Then continue south-east toward Kazinczy Street. The Orthodox synagogue survived inside the ghetto and remains an active religious centre. Its presence prevents this neighbourhood from being described only in the past tense.
    `, ['USHMM_BUDAPEST', 'YELLOW_STAR_HOUSES'], CURATED_IMAGE_URLS['klauzal-square']),

    stop('kazinczy-synagogue', '6. Kazinczy Street and Living Orthodoxy', `
The Kazinczy Street Orthodox Synagogue does not reveal itself from far away. On a narrow street crowded with restaurants and bars, its Art Nouveau façade arrives almost abruptly. Look for the paired towers, stylised decoration and Hebrew inscription.

The Orthodox community announced a competition in 1909 for more than a synagogue. It wanted a complete institutional complex with study spaces, a school, offices, a rabbi’s apartment, kitchens and dining facilities. The Budapest-born brothers Béla and Sándor Löffler ultimately designed the project. The synagogue was inaugurated in September 1913, just before the First World War ended the long period of confident metropolitan construction.

The complex shows that a religious community is also an everyday infrastructure. Maintaining dietary law requires food preparation and supervision. Education requires rooms and teachers. Prayer requires a congregation, but community life also needs welfare organisations, burial societies and places to eat. The institutions around Kazinczy Street helped make Orthodox practice possible in a modern capital.

Architecture complicates any easy opposition between tradition and modernity. The community was committed to Orthodox religious law, yet it chose architects working in a contemporary Hungarian Art Nouveau language and commissioned a technically modern urban complex. Traditional practice did not require an old-fashioned building.

The synagogue was enclosed within the 1944 ghetto, and its community suffered catastrophic losses. After the war and during the socialist decades, Jewish religious life continued under radically reduced and politically constrained conditions. Today the synagogue is active again, while kosher businesses and community institutions operate nearby. That revival is real, but it should not be used to erase rupture or suggest that prewar life has simply returned unchanged.

If you enter on another visit, check current hours, dress requirements and religious holidays; this tour remains outside. From here, walk west along Kazinczy Street toward number 14. In less than three hundred metres you will move from an active synagogue to the venue most responsible for the district’s new international identity. The contrast is genuine, but the two histories occupy the same courtyards and streets.
    `, ['KAZINCZY_OFFICIAL', 'MAZSIHISZ_GUIDE'], CURATED_IMAGE_URLS['kazinczy-synagogue']),

    stop('szimpla-kert', '7. Szimpla and the Invention of the Ruin Bar', `
Stand across from Szimpla Kert and first look at the building rather than the queue or the signs. Number 14 Kazinczy Street dates to the nineteenth century and had residential and industrial uses before a long period of decline. It was old and underused when Szimpla arrived, but “ruin bar” does not mean a bar left untouched in a Second World War bombsite.

The more useful background is post-socialist Budapest. After 1989, ownership disputes, weak maintenance, limited investment and contested redevelopment left many central buildings partly empty or threatened with demolition. That uncertainty created cheap, flexible space. It also created room for experiments that conventional landlords or polished hospitality businesses might not have accepted.

Szimpla began as a small bar on Kertész Street in 2001. Its founders came from art and social-science backgrounds rather than established hospitality careers. In 2002 they opened an outdoor venue on Király Street, then moved to this address in 2004. Early ruin bars used second-hand furniture, improvised decoration and existing architectural wear partly because those materials were affordable. The look later became a recognisable style, copied far beyond its original economic conditions.

The first generation was not only about alcohol. Venues hosted concerts, film screenings, exhibitions, theatre, markets and civic groups. They functioned as informal cultural infrastructure. Academic research on the scene describes a productive tension: hospitality businesses thrived because of physical decay, while their popularity also helped change property values and redevelopment pressures.

Szimpla became internationally famous, and the improvised experiment became a major tourist attraction. The venue still presents itself as a cultural and civic space, but its scale today is far from the small local scene of the early 2000s. That is not necessarily hypocrisy; successful urban experiments often change the conditions that made them possible.

You can understand the courtyard without drinking, and daytime is often better for seeing the fabric of the building. Continue west toward Gozsdu Courtyard. The next stop shows that repurposed courtyards were central to this district long before anyone used the phrase “ruin bar.”
    `, ['OPEN_HERITAGE', 'RUIN_BARS_STUDY'], CURATED_IMAGE_URLS['szimpla-kert']),

    stop('gozsdu-courtyard', '8. Gozsdu: Seven Courtyards, Many Lives', `
Enter Gozsdu Courtyard from Dob Street if the passage is open, then pause before walking through. The sequence of connected courtyards turns a city block into an internal street. Today it is packed with terraces and visitors, but commerce here is not a twenty-first-century invention.

The complex was commissioned by the foundation associated with Manó Gozsdu, also known as Emanuil Gojdu, a lawyer and benefactor of Romanian origin. This is an excellent corrective to a simplified map of the “Jewish Quarter”: Gozsdu himself was not Jewish. The district was shaped by overlapping communities, investors, tenants and institutions rather than a single ethnic ownership.

Designed by Győző Czigler and completed in 1915, the passage combined apartments, workshops and shops across seven courtyards. Its ground-floor units supported dense commercial life, while the multiple entrances connected Király, Dob and Holló streets. The layout made private property behave almost like public infrastructure.

In 1944 the complex fell within the closed Budapest ghetto. After the war, changing ownership, state control and limited maintenance contributed to deterioration. The same deep courtyards that once supported small trade later became difficult and expensive to modernise. A major redevelopment completed around 2009 restored the complex and remade it as a hospitality and entertainment destination.

Compare Gozsdu with Szimpla. Szimpla’s identity depends on visible wear, reuse and an aesthetic of improvisation. Gozsdu presents polished façades, coordinated commercial units and managed public space. Both convert historic courtyards into places of consumption, but they offer almost opposite ideas of authenticity.

Walk slowly through rather than treating the passage as a shortcut. Look above the signs to the residential windows. People still live in and around Budapest’s nightlife district. The final chapter begins at the Király Street exit and asks what happens when a successful cultural scene becomes an urban brand. The answer includes saved buildings and new businesses, but also rent, noise and the right to sleep.
    `, ['GOZSDU_OFFICIAL', 'OPEN_HERITAGE'], CURATED_IMAGE_URLS['gozsdu-courtyard']),

    stop('kiraly-nightlife', '9. Who Owns the Night?', `
At the Király Street end of Gozsdu, turn back toward the passage, then look along the street. This is where several versions of the district compete for space: a place of worship and remembrance, a residential neighbourhood, a restaurant zone, a heritage asset and an international nightlife product.

Ruin bars helped demonstrate that neglected buildings could be reused without first being polished into conventional venues. They gave artists, musicians and civic initiatives space, attracted customers to streets many outsiders had ignored, and strengthened campaigns to value the district’s architectural fabric. Some buildings survived long enough to be protected partly because people had found new reasons to enter them.

Success also changed the equation. From around 2010, a more commercial wave of nightlife expanded alongside hostels and short-term rentals. Visitor numbers grew, rents rose, and venues that had relied on cheap uncertainty faced a much more expensive market. Residents dealt with late-night noise, rubbish and crowds. Some early ruin bars closed; others became large businesses. The improvised aesthetic remained even when the economics were no longer improvised.

There is no honest single verdict. Nightlife can support restoration and employment while making daily life harder for neighbours. Heritage protection can prevent demolition while raising property values and displacing older tenants. Tourism can bring people into contact with Jewish history while also reducing the phrase “Jewish Quarter” to a convenient location label for bars.

A useful visitor habit is to resist treating visible decay as decoration detached from its causes. These courtyards carry the effects of war, the Holocaust, postwar state ownership, deferred maintenance, speculative development and creative reuse. They are not a themed set built for a weekend.

The practical conclusion is simple: enjoy the district, spend money with places you value, and lower your voice when you leave. More importantly, keep its histories in the same frame. The synagogue triangle, the ghetto, the rescue networks, surviving religious life and the ruin-bar experiment are not separate tours accidentally sharing a map. They are successive claims on the same dense urban space—and the argument over what this neighbourhood should become is still open.
    `, ['OPEN_HERITAGE', 'RUIN_BARS_STUDY'], CURATED_IMAGE_URLS['kiraly-nightlife']),
  ],
};
