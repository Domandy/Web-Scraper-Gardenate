import { existsSync, mkdir, mkdirSync, read } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { resolve } from 'path';
import axios, { AxiosError } from "axios";
import { JSDOM } from 'jsdom';

function fetchPage(url:string): Promise<string | undefined> {
    const HTMLData = axios.get(url).then(res => res.data).catch((error: AxiosError) => {
        console.error(`There was an error with ${error}`);
        console.error(error.toJSON());
    });

    return HTMLData;
}

async function fetchFromWebOrCache(url: string, ignoreCache = false) {
    
    // if no cache folder, create it.
    if(!existsSync(resolve(__dirname, '.cache'))) {
        mkdirSync('.cache');
    }

    console.log(`Getting data for ${url}...`);
    if(!ignoreCache && existsSync(
        resolve(__dirname, `.cache/${Buffer.from(url).toString('base64')}.html`),
      )){
        console.log(`${url} read from cache`);
        const HTMLData = await readFile(
            resolve(__dirname, `.cache/${Buffer.from(url).toString('base64')}.html`),
            { encoding: 'utf8' },
          );
        const dom = new JSDOM(HTMLData);
        return dom.window.document
    }else {
        console.log(`fetching url from web`);
        const HTMLData = await fetchPage(url);

        if (!ignoreCache && HTMLData) {
            writeFile(
              resolve(
                __dirname,
                `.cache/${Buffer.from(url).toString('base64')}.html`,
              ),
              HTMLData,
              { encoding: 'utf8' },
            );
        }
        const dom = new JSDOM(HTMLData);
        return dom.window.document
    }                                                                               
}

// extract main page details
async function extractData(document: Document) {
  try {
    const baseURL = 'https://www.gardenate.com';
    const plantListDiv = document.querySelector('.plant-list');
    const table = plantListDiv?.querySelector('.table.table-striped.table-hover');
    const rows = table?.querySelectorAll('tbody tr');

    const extractedData: extractData[] = [];
    if (rows) {
      const promises = Array.from(rows).map(async (row) => {
        const columns = row.querySelectorAll('td');
        if (columns.length >= 2) {
          const title = columns[0].querySelector('a')?.textContent || '';
          const urlPath = columns[0].querySelector('a')?.href || '';
          const url = new URL(urlPath, baseURL).toString();
          const instructions = columns[1]?.textContent || '';

          // Fetch the page data for the url
          const pageDocument = await fetchFromWebOrCache(url);
          // Extract necessary information from the page
          const infoDiv = pageDocument.querySelector('.info');
          const sowingData = infoDiv?.querySelector('.sowing')?.textContent || '';
          const spacing = infoDiv?.querySelector('.spacing')?.textContent || '';
          const harvest = infoDiv?.querySelector('.harvest')?.textContent || '';

          const sowing = sowingData.replace('(Show °F/in)', '');

          extractedData.push({ title, url, instructions, sowing, spacing, harvest });
        }
      });
      await Promise.all(promises);
    }

    const cleanData = cleanedExtractedData(extractedData);
    return cleanData.map(data => {
      return {
        ...data
      }
    })

  } catch (error) {
    console.error('Error:', error)
  };
}


function saveData(filename: string, data: any) {
  if (!existsSync(resolve(__dirname, 'data'))) {
    mkdirSync('data');
  }
  writeFile(resolve(__dirname, `data/${filename}.json`), JSON.stringify(data), {
    encoding: 'utf8',
  });
}

export async function getData() {
  const months = 12;
  for (let i = 0; i < months; i++) {
    const document = await fetchFromWebOrCache(
      `https://www.gardenate.com/?month=${i + 1}`,
      true
    );
    const data = await extractData(document); // Add await here
    saveData(`gardenate ${i + 1}`, data);
  }
}

// Remove trailing tab characters from instructions
function cleanedExtractedData(extractedData: extractData[]): extractData[]{  
    return extractedData.map(data => {
        return {
        ...data,
        instructions: data.instructions.replace(/\t/g, '').replace(/\n/g, ''),
        sowing: data.sowing.replace(/\t/g, '').replace(/\n/g, ''),
        spacing: data.spacing.replace(/\t/g, '').replace(/\n/g, ''),
        harvest: data.harvest.replace(/\t/g, '').replace(/\n/g, ''), // Remove all \t occurrences
        };
    })
};

type extractData = {
    title: string,
    url: string,
    instructions: string,
    sowing: string,
    spacing: string ,
    harvest: string ,

}