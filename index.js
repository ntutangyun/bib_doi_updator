const fs = require("fs");
const axios = require("axios");
const bibtexParse = require("@orcid/bibtex-parse-js");

const Cite = require("citation-js");
require("@citation-js/plugin-ris");

function crossRefQueryTitle(title) {
    const queryUrl = `https://api.crossref.org/works?rows=1&query.bibliographic=${encodeURIComponent(title)}`;
    return axios.get(queryUrl, {headers: {"User-Agent": "BettaFish/1.0 (https://betta-fish-ops.github.io/; mailto:ntutangyun@gmail.com)"}})
        .then(
            async res => {
                // console.log(res.data.message.items);
                if (!res || !res.hasOwnProperty("data") || !res.data.hasOwnProperty("message") || !res.data.message.hasOwnProperty("items")) {
                    return null;
                }
                for (let item of res.data.message.items) {
                    delete item["reference"];
                    delete item["deposited"];
                    delete item["issued"];
                    delete item["funder"];
                    item.citation = {};
                    if (item.hasOwnProperty("DOI")) {
                        // let res = await axios.get('http://dx.doi.org/'+item.DOI,
                        //     {headers: {"Accept": "text/bibliography; style=bibtex"}});

                        // THIS: https://github.com/davidagraf/doi2bib2/blob/master/server/doi2bib.js
                        let doiRes = await axios.get("https://doi.org/" + item.DOI,
                            {headers: {"Accept": "application/x-bibtex; charset=utf-8"}});

                        if (doiRes.status === 200 && doiRes.hasOwnProperty("data")) {
                            item.citation.bibTex = doiRes.data;
                            try {
                                const citation = await Cite.async(doiRes.data);
                                item.citation.ris = citation.format("ris");
                            } catch (err) {
                                console.error(err);
                            }
                        }
                    }
                }
                return res.data.message.items;
            }
        )
        .catch(err => {
            console.log(err);
            return null;
        });
}

const bibContent = fs.readFileSync("original.bib", {encoding: "utf-8"});
const sample = bibtexParse.toJSON(bibContent);

const docsWithoutDOI = sample.filter(doc => !doc.entryTags.hasOwnProperty("doi"));

let bibTexOutput = "";
let risOutput = "";

const multiResultDoc = [];

(async function () {
    let docI = 1;
    const total = docsWithoutDOI.length;
    for (const doc of docsWithoutDOI) {
        const title = doc.entryTags.title.replace("{", "").replace("}", "");
        console.log(`processing (${docI++} / ${total}) ${title}`);
        const items = await crossRefQueryTitle(title);
        if (items && items.length === 1 && items[0].hasOwnProperty("DOI") && items[0].title[0].toLowerCase() === title.toLowerCase() && items[0].citation.hasOwnProperty("ris")) {
            // match
            bibTexOutput = `${bibTexOutput}\n${items[0].citation.bibTex}`;
            risOutput = `${risOutput}\n${items[0].citation.ris}`;
        } else {
            multiResultDoc.push(title);
        }
    }

    fs.writeFileSync("output.bib", bibTexOutput);
    fs.writeFileSync("output.ris", risOutput);
    fs.writeFileSync("manualCheck.json", JSON.stringify(multiResultDoc));
    console.log(`files that require manual processing.`);
    console.log(multiResultDoc);
})();


