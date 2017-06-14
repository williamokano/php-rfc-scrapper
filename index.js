const request = require('request');
const cheerio = require('cheerio');
const winston = require('winston');
const fs = require('fs');
const logger = new (winston.Logger)({
    transports: [
        new (winston.transports.Console)({
            colorize: 'all'
        })
    ]
});

logger.debug('PHP RFC checker started');

const php_rfc_address = 'https://wiki.php.net/rfc';
logger.info(`PHP RFC ADDRESS: ${php_rfc_address}`);

let data = {
    date: null,
    in_voting_phase: [],
    under_discussion: [],
    in_draft: [],
    all: {}
};

let temp_data_rfc = [];
let new_rfcs = [];
let changed_rfcs = [];
let deleted_rfcs = [];

if (fs.existsSync('data.json')) {
    logger.debug('Data file exists');
    data = JSON.parse(fs.readFileSync('data.json'));
}

if (!data.date) {
    data.date = (new Date()).toISOString();
}

request(php_rfc_address, (error, response, body) => {
    processRFCs(body);
    fixDeletedRFCs();
    createChangeLog();
    saveNewData();
});

function processRFCs(body) {
    const $ = cheerio.load(body);
    [
        ["#in_voting_phase + div a", 'in_voting_phase'],
        ["#under_discussion + div a", 'under_discussion'],
        ["#in_draft + div a", 'in_draft']
    ].map(([selector, type]) => doTheMagic($, selector, type));
}

function fixDeletedRFCs() {
    // Find the old ones who wasn't found on the temp_data_rfc (which means it was deleted)
    const old_rfc_data = Object.keys(data.all);
    for (const old_rfc of old_rfc_data) {
        if (!temp_data_rfc.includes(old_rfc)) {
            logger.warn(`RFC ${old_rfc} was not found anymore. Looks like it was deleted!`);
            const rfc_type = data.all[old_rfc];
            const rfc_index = data[rfc_type].indexOf(old_rfc);

            // Delete references
            data[rfc_type].splice(rfc_index, 1);
            delete data.all[old_rfc];
            deleted_rfcs.push(old_rfc)
        }
    }
}

function createChangeLog() {
    const old_date = new Date(data.date);
    const today_date = new Date();

    const change_log_name = `from_${old_date.toISOString()}_to_${today_date.toISOString()}.log`;
    if([new_rfcs, changed_rfcs, deleted_rfcs].filter(p => p.length > 0).length > 0) {
        if (new_rfcs.length > 0) {
            publishNewRFCs(change_log_name);
        }

        if (changed_rfcs.length > 0) {
            publishChangedRFCs(change_log_name);
        }

        if (deleted_rfcs.length > 0) {
            publishDeletedRFCs(change_log_name);
        }
    }
}

function publishNewRFCs(file_name) {
    let leNewRFCsContent = "# New RFC's\n";
    for (const rfc of new_rfcs) {
        leNewRFCsContent += `  - ${rfc}\n`;
    }
    fs.appendFileSync(file_name, leNewRFCsContent);
}

function publishChangedRFCs(file_name) {
    let leNewRFCsContent = "# Updated RFC's\n";
    for (const rfc of changed_rfcs) {
        leNewRFCsContent += `  - ${rfc.name} from [${rfc.from}] -> [${rfc.to}]\n`;
    }
    fs.appendFileSync(file_name, leNewRFCsContent);
}

function publishDeletedRFCs(file_name) {
    let leNewRFCsContent = "# Deleted RFC's\n";
    for (const rfc of deleted_rfcs) {
        leNewRFCsContent += `  - ${rfc}\n`;
    }
    fs.appendFileSync(file_name, leNewRFCsContent);
}

function saveNewData() {
    data.date = new Date();
    logger.debug('Saving new info');
    fs.writeFileSync('data.json', JSON.stringify(data, null, 4));
}

function doTheMagic($, selector, type) {
    $(selector).each(function (i, elem) {
        let rfc = $(this).attr('title');
        if (rfc.startsWith('rfc')) {
            rfc = rfc.substr(4);
        }

        if (!data.all.hasOwnProperty(rfc)) {
                        data.all[rfc] = type;
            data[type].push(rfc);
            new_rfcs.push(rfc);
            logger.warn(`Found new RFC: ${rfc} in [${type}]`);
        } else {
            const oldType = data.all[rfc];
            if (oldType != type) {
                
                // Update the reference on the all
                data.all[rfc] = type;

                // Remove from the old array
                const index = data[type].indexOf(rfc);
                data[oldType].splice(index, 1);

                // Move to the new type array
                data[type].push(rfc);

                // Update the changed rfcs
                changed_rfcs.push({
                    name: rfc,
                    from: oldType,
                    to: type
                });
                logger.warn(`Updated RFC: ${rfc} [${oldType}] -> [${type}]`);
            }
        }

        temp_data_rfc.push(rfc);
    });
}