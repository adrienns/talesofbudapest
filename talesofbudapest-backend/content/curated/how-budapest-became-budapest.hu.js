import {
  CURATED_TOUR_SLUG,
  CURATED_TOUR_VERSION,
  LOCATION_SLUGS,
  STOP_COORDINATES,
  WALKING_ROUTE,
} from './how-budapest-became-budapest.common.js';

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

export const TOUR_HU = {
  slug: CURATED_TOUR_SLUG,
  version: CURATED_TOUR_VERSION,
  locale: 'hu',
  title: 'Hogyan lett Budapestből Budapest?',
  tagline: 'Kb. 2¼ óra · kilenc árulkodó hely, egy bonyolult főváros',
  description: 'Adatokban gazdag első séta a találmányokon, alkukon, katasztrófákon és vitákon át, amelyek létrehozták a modern Budapestet.',
  walkingRoute: WALKING_ROUTE,
  stops: [
    stop('deak-anker', '1. Három városból egy főváros', `
Állj úgy, hogy lásd a Deák Ferenc tér forgalmas csomópontját és az Anker-palota világos, sokablakos tömbjét. Kezdjünk egy kényelmetlen ténnyel azoknak, akik szeretik a rendezett eredettörténeteket: Budapestet nem egyetlen városként alapították. Összerakták.

Először tájékozódjunk. A Duna nyugat felé, néhány percnyi lejtős sétára folyik. A túlparton emelkednek a budai hegyek, fölöttük a Várnegyeddel. Most Pesten állsz, a főváros laposabb, mozgalmasabb felén. Északabbra található Óbuda. Sokáig három külön település élt egymás mellett: a királyi és igazgatási szerepű Buda, a kereskedő Pest és a régebbi Óbuda. 1873-ban egyesítették őket. Ez a dátum nem a semmiből teremtett várost, hanem közös nevet és közös közigazgatást adott egy gyorsan növekvő nagyvárosnak.

A tér névadója Deák Ferenc, az 1867-es kiegyezés egyik meghatározó politikusa, akit gyakran „a haza bölcsének” neveznek. Kora hitt abban, hogy törvényekkel, intézményekkel, hidakkal és sugárutakkal át lehet alakítani az országot. A körülötted álló város ennek a hitnek az egyik eredménye. Egy másik a lábad alatt fut: az 1896-ban megnyílt M1-es a kontinentális Európa első földalatti vasútja volt. A modernnek látszani akaró főváros a föld alá is építkezett.

Nézd meg az Anker-palotát. A mai épületet Alpár Ignác tervezte az Anker biztosítótársaság számára, és a huszadik század elején készült el. Tornyai és mozgalmas homlokzata színpadszerű kaput alkot a történelmi belváros és a nagy utak között. Nem ősi Budapestet látsz, hanem egy várost, amely modern európai fővárosként mutatja be önmagát.

A séta során újra és újra előkerül Buda és Pest neve. A magyarban mindig az első szótag hangsúlyos: BU-da-pest. A magyar az uráli nyelvcsaládhoz tartozik, eltérően a szomszédos népek többségének indoeurópai nyelveitől. A tizenkilencedik században a nyelv a nemzeti kultúra egyik legerősebb jelévé vált: az intézmények, az irodalom és a közélet egyre nagyobb része működött magyarul.

Ez a séta egy egyszerű kérdést tesz próbára: mi kellett ahhoz, hogy három város egyetlen fővárosként működjön? Reformerekkel, mérnökökkel, pénzemberekkel és kávésokkal találkozunk, de háborúval, diktatúrával és vitatott emlékezettel is. Indulj a Szent István-bazilika kupolája felé. A szűk utcák után szándékosan hirtelen tölti be a látómezőt az épület.
    `, ['S01', 'S02', 'S03', 'S30']),

    stop('st-stephens', '2. A kupola, amely leomlott', `
Menj a tér közepe felé, és hagyd, hogy a Bazilika betöltse a látómeződet. Mérete tudatos választás volt. A tizenkilencedik századi Pest rendkívüli gyorsasággal nőtt, az új városrészeknek pedig olyan templom kellett, amely a város világi ambícióival is versenyre kelhetett.

Az építkezés 1851-ben indult Hild József tervei alapján. 1868-ban súlyos szerkezeti hibák miatt a félkész kupola beomlott. A templomban ekkor nem tartózkodott gyülekezet. A munkát Ybl Miklós vette át: újravizsgálta a szerkezetet, és jelentős részeket reneszánsz ihletésű formában tervezett át. Halála után Kauser József fejezte be a belső tereket. A templomot 1905-ben szentelték fel, több mint fél évszázaddal az alapozás után.

Az építés története többet mond egy nagyszabású jelszónál: megmutatja, hogyan működtek a nagy tizenkilencedik századi beruházások—lassan, hibákkal, politikai türelemmel és változó tervekkel. Nézd meg a két harangtornyot és a mély oszlopcsarnokot, azután emeld fel a tekinteted a kupolára. Mintegy kilencvenhat méteres magasságát hagyományosan az Országházéval azonosnak adják meg. A városképben a templom és a törvényhozás két fontos intézményként felel egymásnak.

A Bazilika I. István nevét viseli. A nagyjából 1000-ben megkoronázott uralkodóra a keresztény Magyar Királyság első királyaként emlékezünk. Uralma a latin kereszténységhez és a középkori Európa politikai rendjéhez kapcsolta az új királyságot. A későbbi századokban István a magyar államiság központi alakjává vált. A templomban őrzik a Szent Jobbot, az Istvánnak tulajdonított mumifikálódott jobb kezet.

Itt érdemes elválasztani a bizonyítható történelmet a vallási hagyománytól. István uralma, törvényei és egyházalapításai történeti kérdések. Egy ezeréves ereklye azonosítása és útja középkori hagyományokon és későbbi iratokon keresztül jutott el hozzánk. A hitet tisztelhetjük anélkül, hogy a hagyományt természettudományos bizonyosságként kezelnénk.

Indulás előtt nézz körül a téren is. A kávézók, teraszok és helyreállított homlokzatok megmutatják, hogyan kapcsolódik egy szakrális épület a hétköznapi városi élethez. Budapest műemlékei ritkán különülnek el az evéstől, a találkozástól és a beszélgetéstől.

Innen északnyugat felé menj tovább a Szabadság térre. Néhány háztömb alatt megváltozik a város nyelve: a hit helyét a pénz, a hatalom és az emlékezet veszi át.
    `, ['S04', 'S05', 'S06']),

    stop('liberty-square', '3. Szabadság tér: vita az emlékezetről', `
A Szabadság tér elegáns, zöld és meglepően nehezen foglalható össze egyetlen mondatban. Éppen ezért fontos. Az épületek és emlékművek nem egyetlen harmonikus történetet mondanak el, hanem vitatkoznak egymással.

A tér helyén egykor a hatalmas Habsburg katonai komplexum és börtön, az Újépület állt. Itt végezték ki 1849-ben Batthyány Lajost, az első felelős magyar kormány miniszterelnökét, a szabadságharc leverése után. Az épületet a tizenkilencedik század végén bontották le, helyén a modern pénzügyi negyed részeként alakították ki a teret. Az egykori Tőzsdepalota és a Magyar Nemzeti Bank a késő dualista főváros gazdasági önbizalmát fejezte ki.

Az északi oldalon áll a szovjet hősi emlékmű, amely a Budapestért 1944–45-ben vívott harcokban elesett szovjet katonáknak állít emléket. A Vörös Hadsereg hozzájárult a náci német uralom és a nyilas terror megszüntetéséhez. Egyúttal szovjet katonai megszállás, majd kommunista diktatúra következett. Mindkét állítás szükséges a történethez. Ha csak felszabadításról vagy csak megszállásról beszélünk, valami lényeges kimarad.

A tér déli szélén a német megszállás áldozatainak emlékműve Gábriel arkangyallal jelképezi Magyarországot, amelyre a birodalmi sas lecsap. Németország 1944. március 19-én szállta meg szövetségesét, Magyarországot. Ez döntő fordulat volt: ezután a magyar hatóságok részt vettek magyar zsidók százezreinek rendkívül gyors gettósításában és deportálásában. Az emlékmű bírálói szerint a kompozíció Magyarországot kizárólag ártatlan áldozatként mutatja, és elhomályosítja a magyar intézmények és közreműködők felelősségét.

Tiltakozásként civilek élő ellenemlékművet hoztak létre előtte. Fényképek, kövek, kézzel írt történetek és személyes tárgyak egyéni életekre és összetettebb felelősségre emlékeztetnek. A tárgyak változnak, ezért csak azt írd le magadnak, amit most valóban látsz.

Itt nem kell kész ítéletet kapnod az idegenvezetőtől. Inkább figyeld meg a térbeli vitát: szovjet emlékmű, amerikai nagykövetség, állami emlékmű és civil ellenemlékmű áll egymás mellett. Mindegyik ugyanazokat a kérdéseket teszi fel: ki volt áldozat, felszabadító vagy megszálló, és kinek kell felelősséget vállalnia?

A közterület Budapest egyik történeti levéltára, ugyanakkor ma is használt politikai nyelv. Indulj tovább az Országház felé, és vidd magaddal ezt a bizonytalanságot. A következő teret nemzeti magabiztosság kifejezésére tervezték, mégis többször vált az állam és polgárai közötti összeütközés helyszínévé.
    `, ['S07', 'S08', 'S09', 'S10']),

    stop('parliament-kossuth', '4. Az Országház: nemzetgyártó gépezet', `
Menj beljebb a Kossuth térre, amíg egyszerre látod az Országház hosszú dunai homlokzatát és középső kupoláját. Ma megkerülhetetlennek tűnik, pedig egy különleges politikai korszak terméke.

Az 1867-es kiegyezés után Magyarországnak saját országgyűlése és kormánya volt a dualista monarchián belül. Buda, Pest és Óbuda 1873-ban egyesült, az új főváros pedig rangjához méltó állandó törvényhozási épületet akart. Az 1880-as évek tervpályázatát Steindl Imre neogótikus terve nyerte. Az építkezés 1885-ben kezdődött, az épületet az 1896-os millenniumi ünnepségek idején felavatták, a munkák pedig 1904-ben fejeződtek be. Steindl 1902-ben meghalt, így a teljesen elkészült művet nem láthatta.

A gótika történelmi európai parlamenteket idéz, de az épület nem egyszerűen Westminster másolata. Szimmetrikus alaprajza a korszak kétkamarás törvényhozását tükrözi; középen a kupola köti össze a két oldalt. Kőfaragók, üvegművesek, lakatosok, festők és szobrászok munkája a magyar ipar és kézművesség bemutatóterévé tette az építkezést. Egyben csúcstechnológia is volt: gáz- és villanyvilágítást, központi fűtést és hűtést, tűzvédelmet, telefont és 112 központilag vezérelt elektromos órát kapott. A hatalmas méret azt üzente, hogy Budapest többé nem tartja magát vidéki városnak; a gépészete pedig azt, hogy nem is akar úgy működni.

A kupolacsarnokban látható a Szent Korona. Hagyományosan Szent István koronájának nevezik, bár ma fennmaradt részei későbbi századokból származnak. A nemzeti jelkép és a tárgy szigorúan vett története itt sem fér bele ugyanabba az egyszerű mondatba.

A tér 1956. október 25-ének emlékét is őrzi. A kommunista uralom és a szovjet függés elleni forradalom idején fegyvertelen tömeg gyűlt össze itt. A lövések sok embert megöltek és megsebesítettek. A tűzharc pontos menete és az áldozatok száma ma is kutatás tárgya, ezért a felelős elbeszélés nem állít hamis pontosságú halálos áldozatszámot. Annyi bizonyos, hogy a Kossuth téri vérengzés a forradalom egyik meghatározó traumája lett.

Tekints a térre színpadként. A politikai rendszerek újra és újra átrendezték: szobrokat állítottak, eltávolítottak és visszahoztak, emlékhelyeket mozgattak, végül magát a felszínt is átépítették. A képeslapokon az Országház változatlan, a körülötte lévő politikai táj azonban soha nem volt az.

Mielőtt a folyóhoz indulsz, nézz még egyszer a kupolára. Szép, de a szépség itt állítás is: az alkotmányos kormányzásról, a nemzeti folytonosságról és Magyarország európai helyéről. Most indulj dél felé a rakparton egy olyan emlékműhöz, amelynek nincs kupolája, hősi alakja, és alig használ szavakat.
    `, ['S11', 'S12', 'S13', 'S14', 'S31']),

    stop('shoes-danube', '5. Cipők a Duna-parton', `
Kérlek, csendesen közelíts, és hagyj helyet a többi látogatónak. A hatvan pár vascipő ötlete Can Togay filmrendezőtől származik, az alkotást Pauer Gyula szobrásszal készítette. Az emlékművet 2005-ben avatták fel. Azokra emlékezik, akiket a magyar nyilas mozgalom tagjai 1944-ben és 1945-ben a budapesti Duna-parton gyilkoltak meg.

Miután a náci Németország 1944 márciusában megszállta Magyarországot, magyar hatóságok közreműködtek a zsidó lakosság üldözésében, gettósításában és deportálásában. Októberben a Nyilaskeresztes Párt ragadta magához a hatalmat. Fegyveresei terrorizálták Budapestet, ezreket hajtottak halálmenetekben, és embereket gyilkoltak az utcákon, kórházakban és a Duna mellett. A parton az áldozatokkal olykor levetették cipőjüket, mielőtt agyonlőtték őket. A cipő értékes háborús tulajdon volt. A testeket elvitte a folyó.

Az emlékmű nem azonosítható emberek cipőit másolja. Férfi munkacipők, elegáns női lábbelik és gyerekcipők korabeli típusait látod, így a hiány válik a mű központi képévé. Ez fontos különbség: egyik párhoz sem szabad nevet, utolsó beszélgetést vagy kitalált élettörténetet kapcsolnunk.

Köveket, gyertyákat és virágokat láthatsz a cipőkben vagy körülöttük. Ezeket látogatók hagyták az emlékezés jeleként; ne mozdítsd el őket. A három magyar, angol és héber nyelvű tábla az 1944–45-ben nyilas fegyveresek által a Dunába lőtt áldozatok emlékét nevezi meg.

A helyszín nehéz ellentétet teremt. Az Országház néhány percnyire áll, a budai Vár a túlpart fölé magasodik, a folyami forgalom pedig folytatódik. Az emlékmű azt kérdezi, hogyan történhetett tömeges erőszak egy főváros hétköznapi terében. A magyar felelősséget is egyértelművé teszi. A német megszállás döntő volt a magyarországi holokausztban, de az itt felidézett fegyveresek egy magyar fasiszta mozgalomhoz tartoztak.

Ennél a megállónál nincs szükség felemelő lezárásra. Ha helyénvalónak érzed, most állítsd meg a hangot, és maradj csendben egy rövid ideig.

Amikor készen állsz, indulj dél felé a Magyar Tudományos Akadémia és a Lánchíd irányába. A következő fejezet visszatér azokhoz a reformkori emberekhez, akik úgy gondolták, hogy a kapcsolatok—nyelv és tudás, két folyópart, kiváltság és közteherviselés között—átalakíthatják az országot.
    `, ['S15', 'S16', 'S17']),

    stop('academy-chain-bridge', '6. Széchenyi és a reform építészete', `
Állj úgy, hogy egyszerre lásd a Magyar Tudományos Akadémiát és a tér mögött a Lánchidat. A két nevezetességet nemcsak egy híres név kapcsolja össze. Együtt fejezik ki gróf Széchenyi István reformprogramját.

Széchenyi 1825. november 3-án, a pozsonyi országgyűlésen birtokai egyévi jövedelmét ajánlotta fel egy magyar tudós társaság támogatására. Más főurak is csatlakoztak hozzá. A későbbi Magyar Tudományos Akadémia feladata a tudomány előmozdítása és a magyar tudományos nyelv művelése lett. Palotáját 1865-ben nyitották meg. A porosz Friedrich August Stüler által tervezett épület Pest korai, monumentális neoreneszánsz alkotásai közé tartozik.

Fordulj a híd felé. Megnyitása előtt a dunai átkelés csónakoktól, kompoktól és egy időszakos hajóhídtól függött. Jég, árvíz és rossz idő megszakíthatta a kapcsolatot. Egy állandó híd ügyének legfontosabb politikai motorja Széchenyi lett. A hidat az angol William Tierney Clark tervezte, az építkezést a skót Adam Clark vezette a helyszínen. Azonos vezetéknevük ellenére nem voltak rokonok.

A munkák 1839-ben kezdődtek, a hidat pedig 1849 novemberében, a szabadságharc veresége után nyitották meg. Az ekkor már döblingi intézetben élő Széchenyi soha nem sétált át elkészült művén. A híd évtizedekkel a közigazgatási egyesítés előtt kötötte össze Budát és Pestet.

A Lánchíd a nemesi kiváltságokat is megkérdőjelezte. A magyar nemesség hagyományosan számos közteher és vám alól mentességet élvezett. A híd jogi rendszere minden használótól, így a nemesektől is díjat követelt. Ez egyszerre tette gyakorlati átkelővé és politikai jelképpé: a modern infrastruktúra közös felelősséget jelent.

A visszavonuló német csapatok 1945 januárjában Budapest többi Duna-hídjával együtt felrobbantották. Újjáépítve 1949. november 20-án, az első megnyitás századik évfordulóján adták át. Mai formája ezért egyszerre őrzi a tizenkilencedik századi tervet és a huszadik századi rekonstrukciót.

Nézz át a Várhegyre. Innen Buda szinte karnyújtásnyira van, pedig a folyó egykor komoly fizikai és társadalmi választóvonal volt. A Lánchíd önmagában nem hozta létre Budapestet, de a mindennapokban elképzelhetővé tette az egyesült várost.

Továbbindulva figyeld meg, hogyan vált a reform építészetté: akadémia a nyelvnek és tudománynak, híd a közlekedésnek és kereskedelemnek, tér mindezek bemutatására. A következő állomás, a Gresham-palota azt mutatja meg, mi lett az eredménye, amikor ezek a reformok egy nemzetközi kereskedőváros növekedését segítették.
    `, ['S18', 'S19', 'S20']),

    stop('gresham-palace', '7. Gresham-palota: amikor a biztosítás látványosság lett', `
Fordulj a Gresham-palota ívelt homlokzata felé, és keress pávákat, virágmintákat, mozaikokat és kovácsoltvas részleteket. Ez a huszadik század eleji Budapest: gazdag, technikailag magabiztos, és kész arra, hogy a kereskedelmet művészetté alakítsa.

A telken korábban a Nákó-ház állt, az üzleti és társasági élet egyik helyszíne. A mai épületet a brit Gresham Life Assurance biztosítótársaság emeltette irodák és fényűző lakások számára. Quittner Zsigmond tervezte a Vágó fivérekkel, és 1906-ban készült el. Nevét Sir Thomas Greshamről, a londoni Királyi Tőzsdéhez kötődő tizenhatodik századi angol pénzemberről kapta.

Az épület a szecesszió magyarországi változatához tartozik. Tervezői nem leválasztható díszként kezelték az ornamentikát, hanem összehangolták az építészetet, a vasat, az üveget, a kerámiát és a bútorokat. A központi átjárón egykor hintók hajthattak be, miközben üzletek, irodák és lakások hozták egy fedél alá a nagyvárosi élet különböző részeit.

Ezt az eleganciát az előző fejezetben megismert hálózatok tartották fenn: hidak, vasutak, bankok, biztosítók, egy növekvő középosztály és a modernizálni akaró városvezetés. Budapest lakossága az egyesítés körüli évtizedekben sokszorosára nőtt. A reprezentatív épületek nemcsak műalkotások, hanem reklámok is voltak. Egy biztosítótársaságnak nem elég irodára volt szüksége: azt akarta, hogy az ügyfél a megbízhatóságot kőbe faragva, vasba hajlítva és mozaikban csillogva érezze.

A huszadik század kevésbé bánt kíméletesen a házzal. A Gresham megsérült Budapest ostromában. A szocialista állami tulajdon idején lakásokra és irodákra osztották, állapota romlott. A huszonegyedik század elején nagyszabású felújítással szállodává alakították. Sok eredeti részletet helyreállítottak vagy rekonstruáltak, miközben az épület használata és társadalmi hozzáférhetősége is megváltozott.

Érdemes észrevenni ezt a feszültséget. A restaurálás megmenthet építészetet, mesterségbeli tudást és városi emlékezetet. Ugyanakkor egy vegyes használatú házat olyan drága térré alakíthat, amelyet a legtöbb városlakó csak kívülről lát. A városok mindig mai gazdasági döntéseken keresztül őrzik múltjukat.

Lépj közelebb, és az egész homlokzat helyett vizsgálj meg egyetlen részletet: egy pávát, egy vaskorlát ívét vagy egy színes mozaikot. Az „aranykor” érthetőbbé válik, ha meglátod a belefektetett munkát.

Innen menj a Vörösmarty tér felé. A következő állomás a biztosítás és befektetés világából a modern Budapest egy másik intézményébe vezet: a kávéházba, ahol üzlet, irodalom, pletyka és nagyvárosi szerepjáték ült egymás mellett.
    `, ['S21', 'S22', 'S23']),

    stop('vorosmarty-gerbeaud', '8. Kávéházak: az eredeti közösségi iroda', `
A Vörösmarty tér kevésbé ünnepélyes, mint az előző állomások, mégis ugyanahhoz a történethez tartozik. Egy modern fővároshoz nem elég a kormányzati épület. Olyan helyek is kellenek, ahol az emberek találkoznak, vitatkoznak, olvasnak, megmutatják magukat és megtanulják a városi élet íratlan szabályait.

A tér Vörösmarty Mihály költő és drámaíró nevét viseli. Az 1836-ban írt Szózat a magyar hazafias költészet egyik legfontosabb műve lett. Nyitánya közvetlenül szólítja meg a magyart, és az egyéni hűséget a hazához köti. A magyarul nem beszélő látogató is megértheti, miért volt ilyen fontos az irodalom egy olyan kultúrában, ahol a nyelv politikai jelentést hordozott.

A téren áll a Gerbeaud. Elődjét Kugler Henrik alapította 1858-ban, majd 1870-ben költöztette ide. A svájci születésű Gerbeaud Emil az 1880-as években csatlakozott az üzlethez, és nagymértékben bővítette termelését és hírnevét. Neki tulajdonítják a konyakmeggy és a macskanyelv hazai bevezetését. A finom sütemények, csokoládék és gazdag belső terek célponttá tették a kávéházat, ezek a helyek azonban nemcsak luxusfogyasztásra szolgáltak.

Budapest kávéházai olvasóteremként, irodaként, klubként és informális hírcsereként működtek. Újságokat tartottak, az írók órákig dolgozhattak egy asztalnál, szerkesztők, színészek, ügyvédek és kereskedők szakmai kapcsolatokat építettek. Egyes helyek különböző közösségek otthonai lettek. A leghíresebb irodalmi történetek más pesti kávéházakhoz kötődnek, a Gerbeaud viszont ugyanennek a kultúrának elegáns, kozmopolita oldalát mutatja.

Figyeld meg, hogyan áramlik körülötted a tér. A Váci utca vásárlókat hoz, a Duna közel van, a metró és a villamos pedig távoli városrészeket köt a belvároshoz. Egy jól működő tér nemcsak egy szobor kerete, hanem hétköznapi útvonalak találkozása.

Az ételeket gyakran időtlen hagyományként mutatják be az utazónak, pedig technológia, kereskedelem és divat alakítja őket. A tizenkilencedik századi cukrászat importált alapanyagot, különleges gépeket, képzett munkaerőt és elkölthető jövedelemmel rendelkező vendégeket igényelt. Egy sütemény éppúgy beszélhet birodalomról és urbanizációról, mint egy homlokzat.

Ez gyakorlati pihenő is. Magyarul a „köszönöm” az egyik leghasznosabb szó, a „jó napot” pedig udvarias nappali köszönés. A tökéletes kiejtésnél fontosabb a szándék.

Az utolsó megállóhoz indulj a Duna és a Vigadó felé. Nem újabb dátumlistával zárunk, hanem megpróbáljuk elolvasni a látképet, és egyetlen panorámában összeilleszteni a kilenc fejezetet.
    `, ['S24', 'S25', 'S26']),

    stop('vigado-promenade', '9. A folyó a térkép', `
Állj a korzón úgy, hogy a Vigadó mögötted vagy melletted, a budai part pedig előtted legyen. A mai Vigadót Feszl Frigyes tervezte, és 1865-ben nyitották meg. Építészete nem illik egyetlen importált stílusba: mór, román és sajátosan magyar formakeresés keveredik a homlokzaton. Egy korábbi, az 1848–49-es szabadságharcban megsérült hangversenyépület helyét vette át.

A Vigadó koncerteknek, báloknak, ünnepségeknek és kiállításoknak adott otthont. Az Akadémiához, a hídhoz és a kávéházakhoz hasonlóan egy születő főváros kulturális infrastruktúrájához tartozott. A második világháborúban súlyosan megsérült, majd később újjáépítették. Az előtted álló ház egyszerre tizenkilencedik századi alkotás és huszadik századi javításokkal formált túlélő.

Most fordulj a panoráma felé. A Várhegy a királyi Buda hosszú történetét képviseli. A lapos part, ahol állsz, a kereskedő Pestet és annak látványos tizenkilencedik századi növekedését. A Lánchíd a reformerek összekötési szándékát jelzi. Az Országház az egyesített város politikai ambícióját hirdeti. Kupolák, tornyok, szállodák, bérházak és rakpartok mutatják, hogyan tárgyalt minden nemzedék ugyanazzal a folyóval.

Budapest 1873-ban lett egyetlen önkormányzat, de a séta városa nem egy év alatt készült. István középkori királysága az államiság jelképeit adta. A reformerek a nyelvet, tudást és közösen fenntartott infrastruktúrát támogatták. A dualizmus politikai feltételeket és tőkét teremtett a hatalmas városépítéshez. Az építészek emlékezetes formát adtak az intézményeknek. Háború és diktatúra emberéleteket és épületeket pusztított el. A későbbi nemzedékek újjáépítettek, helyreállítottak, vitatkoztak és emléket állítottak.

Az utolsó előtti ige—vitatkoztak—különösen fontos. A Szabadság tér megmutatja, hogy az emlékezet nem befejezett emlékmű. A Kossuth tér bizonyítja, hogy a nemzeti tér a politikával együtt változik. A Cipők a hiány erejével kérdőjelezi meg a hivatalos monumentalitást. A Gresham-palota felteszi a kérdést, ki részesül a megőrzött örökségből. Budapest akkor a legérdekesebb, amikor szépsége és ellentmondásai egyszerre láthatók.

Válassz egy részletet, amelyet a séta előtt nem vettél volna észre: a híd vámjában megjelenő közteherviselést, egy bérházból lett luxusszállodát vagy két emlékmű vitáját ugyanarról a múltról. Ez lehet az út hasznos emléke: nem dátumlista, hanem működő térkép arról, milyen erők hozták létre ezt a látképet.

Innen könnyen eléred a Duna-parti villamost, a Lánchidat, a belvárosi metrókat és Pest éttermeit. A budai Vár külön, nyugodt sétát érdemel, nem egy sietős függeléket ehhez az úthoz.

Három egykori város történetével indultál, és egy főváros két partját nézve fejezed be. Budapest újra és újra megépített, lerombolt és helyreállított kapcsolatokból készült—és a város ma is vitatkozik arról, mit jelentenek ezek a kapcsolatok.
    `, ['S27', 'S28', 'S01', 'S29']),
  ],
};
