import fs from 'fs';
import { parseCSVText, detectAnomalies, generateImportReport } from '../src/lib/csvParser';

const text = fs.readFileSync('Expenses Export.csv', 'utf-8');
const raw = parseCSVText(text);
const res = detectAnomalies(raw);
res.fileName = 'Expenses Export.csv';
const report = generateImportReport(res);
fs.writeFileSync('IMPORT_REPORT.md', report);
console.log('Successfully wrote IMPORT_REPORT.md');
