        // =========================================================
        // ===== ADMINISTRATIE MODULE ==============================
        // =========================================================

        // --- IndexedDB setup ---
        const ADMIN_DB_VERSION = 1;
        let _adminDB = null;
        let _adminDBName = null;

        function getAdminDBName() {
            const uid = currentUser && currentUser.id ? currentUser.id : 'default';
            return 'kts_admin_' + uid;
        }

        function openAdminDB() {
            return new Promise((resolve, reject) => {
                const dbName = getAdminDBName();
                // If user changed, close old DB and open new one
                if (_adminDB && _adminDBName !== dbName) {
                    _adminDB.close();
                    _adminDB = null;
                    _adminDBName = null;
                }
                if (_adminDB) return resolve(_adminDB);
                const req = indexedDB.open(dbName, ADMIN_DB_VERSION);
                req.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains('adminUploads')) db.createObjectStore('adminUploads', { keyPath: 'id' });
                    if (!db.objectStoreNames.contains('adminTransactions')) {
                        const txStore = db.createObjectStore('adminTransactions', { keyPath: 'id' });
                        txStore.createIndex('uploadId', 'uploadId', { unique: false });
                    }
                    if (!db.objectStoreNames.contains('adminInvoices')) db.createObjectStore('adminInvoices', { keyPath: 'filename' });
                    if (!db.objectStoreNames.contains('adminSettings')) db.createObjectStore('adminSettings', { keyPath: 'key' });
                };
                req.onsuccess = (e) => { _adminDB = e.target.result; _adminDBName = dbName; resolve(_adminDB); };
                req.onerror = (e) => reject(e.target.error);
            });
        }

        const adminDB = {
            async getAll(store) {
                const db = await openAdminDB();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction(store, 'readonly');
                    const req = tx.objectStore(store).getAll();
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = () => reject(req.error);
                });
            },
            async get(store, key) {
                const db = await openAdminDB();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction(store, 'readonly');
                    const req = tx.objectStore(store).get(key);
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = () => reject(req.error);
                });
            },
            async put(store, item) {
                const db = await openAdminDB();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction(store, 'readwrite');
                    const req = tx.objectStore(store).put(item);
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = () => reject(req.error);
                });
            },
            async delete(store, key) {
                const db = await openAdminDB();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction(store, 'readwrite');
                    const req = tx.objectStore(store).delete(key);
                    req.onsuccess = () => resolve();
                    req.onerror = () => reject(req.error);
                });
            },
            async getAllByIndex(store, indexName, key) {
                const db = await openAdminDB();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction(store, 'readonly');
                    const idx = tx.objectStore(store).index(indexName);
                    const req = idx.getAll(key);
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = () => reject(req.error);
                });
            },
            async clear(store) {
                const db = await openAdminDB();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction(store, 'readwrite');
                    const req = tx.objectStore(store).clear();
                    req.onsuccess = () => resolve();
                    req.onerror = () => reject(req.error);
                });
            }
        };

        // --- Folder handles ---
        let _adminFolderHandles = { invoices: null, export: null, transactions: null };

        async function adminPickFolder(type) {
            if (!window.showDirectoryPicker) {
                showToast('⚠️ Je browser ondersteunt geen mapkiezer · gebruik Chrome of Edge');
                return;
            }
            try {
                const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
                _adminFolderHandles[type] = handle;
                adminUpdateFolderUI(type, handle.name);
                // Persist handle in IndexedDB
                await adminDB.put('adminSettings', { key: 'folderHandle_' + type, value: handle });
                // Auto-scan folders
                if (type === 'invoices') await adminScanInvoicesFolder(handle);
                if (type === 'transactions') await adminScanTransactionsFolder(handle);
            } catch (e) {
                if (e.name !== 'AbortError') showToast('⚠️ Map kiezen mislukt');
            }
        }

        function adminUpdateFolderUI(type, name) {
            const labelId = { invoices: 'admin-invoices-folder-label', export: 'admin-export-folder-label', transactions: 'admin-transactions-folder-label' }[type];
            const btnId = { invoices: 'admin-invoices-folder-btn', export: 'admin-export-folder-btn', transactions: 'admin-transactions-folder-btn' }[type];
            const label = document.getElementById(labelId);
            const btn = document.getElementById(btnId);
            if (label) label.textContent = '✅ ' + name;
            if (btn) btn.classList.add('linked');
        }

        async function adminRestoreFolderHandles() {
            for (const type of ['invoices', 'export', 'transactions']) {
                try {
                    const stored = await adminDB.get('adminSettings', 'folderHandle_' + type);
                    if (stored && stored.value) {
                        const handle = stored.value;
                        // Request permission (browser shows a small prompt, not the full picker)
                        const perm = await handle.requestPermission({ mode: 'readwrite' });
                        if (perm === 'granted') {
                            _adminFolderHandles[type] = handle;
                            adminUpdateFolderUI(type, handle.name);
                        } else {
                            // Permission not granted yet · show name but indicate needs re-auth
                            adminUpdateFolderUI(type, '🔒 ' + handle.name + ' (klik om toegang te geven)');
                            // Store handle anyway so re-clicking can re-request
                            _adminFolderHandles[type] = handle;
                        }
                    }
                } catch (e) {
                    // Handle expired or unavailable, ignore
                    console.warn('Folder handle restore mislukt voor ' + type + ':', e.message);
                }
            }
            // Restore invoice base path
            try {
                const bp = await adminDB.get('adminSettings', 'invoiceBasePath');
                if (bp && bp.value) {
                    const el = document.getElementById('admin-invoice-base-path');
                    if (el) el.value = bp.value;
                }
            } catch (e) {
                console.warn('Restore invoice base path mislukt:', e.message);
            }
        }

        async function adminSaveInvoiceBasePath(val) {
            val = val.trim().replace(/[\\/]+$/, '');
            await adminDB.put('adminSettings', { key: 'invoiceBasePath', value: val });
            showToast('✓ Facturen-pad opgeslagen');
        }

        async function adminGetInvoiceBasePath() {
            try {
                const bp = await adminDB.get('adminSettings', 'invoiceBasePath');
                return bp && bp.value ? bp.value.trim().replace(/[\\/]+$/, '') : '';
            } catch (e) { return ''; }
        }

        // --- Invoice folder scanner ---
        async function adminScanInvoicesFolder(dirHandle) {
            showToast('🔍 Facturen scannen...');
            const invoices = [];
            const fileEntries = [];
            async function scanDir(handle, path) {
                for await (const entry of handle.values()) {
                    if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.pdf')) {
                        fileEntries.push({ entry, path });
                    } else if (entry.kind === 'directory') {
                        await scanDir(entry, path ? path + '/' + entry.name : entry.name);
                    }
                }
            }
            await scanDir(dirHandle, '');

            // Process each PDF: extract metadata + text content
            const hasPdfJs = typeof pdfjsLib !== 'undefined';
            let processed = 0;
            for (const { entry, path } of fileEntries) {
                processed++;
                if (processed % 5 === 0 || processed === fileEntries.length) {
                    showToast('🔍 Facturen scannen... ' + processed + '/' + fileEntries.length);
                }
                const file = await entry.getFile();
                const inv = {
                    filename: entry.name,
                    path: path ? path + '/' + entry.name : entry.name,
                    size: file.size,
                    lastModified: new Date(file.lastModified).toISOString(),
                    quarterFolder: path.split('/')[0] || '',
                    linkedToTransaction: null,
                    // Extracted data from PDF content
                    extractedAmount: null,
                    extractedAmounts: [],
                    extractedInvoiceNr: null,
                    extractedDate: null,
                    extractedName: null,
                    extractedIBAN: null,
                    extractedText: ''
                };

                // Extract text from PDF
                if (hasPdfJs) {
                    try {
                        const arrayBuf = await file.arrayBuffer();
                        const pdf = await pdfjsLib.getDocument({ data: arrayBuf }).promise;
                        let fullText = '';
                        // Only read first 2 pages (enough for invoice header info)
                        const maxPages = Math.min(pdf.numPages, 2);
                        for (let p = 1; p <= maxPages; p++) {
                            const page = await pdf.getPage(p);
                            const content = await page.getTextContent();
                            const pageText = content.items.map(i => i.str).join(' ');
                            fullText += pageText + ' ';
                        }
                        fullText = fullText.trim();
                        inv.extractedText = fullText.slice(0, 2000); // Keep first 2000 chars for search

                        // Extract amounts (€/£/$ XX,XX patterns)
                        const amountMatches = fullText.match(/[€£$]\s*[\d.,]+/g) || [];
                        const amounts = amountMatches.map(m => {
                            const currency = m.charAt(0);
                            let s = m.replace(/[€£$]/, '').trim();
                            if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
                            else if (s.includes(',')) s = s.replace(',', '.');
                            return { value: parseFloat(s), currency };
                        }).filter(a => !isNaN(a.value) && a.value > 0);
                        inv.extractedAmounts = [...new Set(amounts.map(a => a.value))];
                        // Detect primary currency
                        const currencies = amounts.map(a => a.currency);
                        inv.extractedCurrency = currencies.includes('€') ? 'EUR' : currencies.includes('£') ? 'GBP' : currencies.includes('$') ? 'USD' : 'EUR';
                        // Main amount: always incl. BTW/VAT (= the amount on the bank statement)
                        const parseAmountStr = (s) => {
                            if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
                            else if (s.includes(',')) s = s.replace(',', '.');
                            return parseFloat(s);
                        };
                        const cur = '[€£$]';
                        // 1. Look for explicit "incl. BTW" / "incl. VAT" amount
                        const inclMatch = fullText.match(new RegExp('(?:incl\\.?\\s*(?:btw|vat)|inclusief\\s*(?:btw|vat))[^€£$]*[€£$]\\s*([\\d.,]+)', 'i'))
                            || fullText.match(new RegExp('[€£$]\\s*([\\d.,]+)[^€£$]*(?:incl\\.?\\s*(?:btw|vat)|inclusief\\s*(?:btw|vat))', 'i'));
                        // 2. Look for "te betalen" / "amount due" / "total due" / "Total:"
                        const teBetalenMatch = fullText.match(new RegExp('(?:te\\s*betalen|amount\\s*due|total\\s*due|verschuldigd|Total:)[^€£$]*[€£$]\\s*([\\d.,]+)', 'i'));
                        // 3. Generic "totaal/total" (but NOT "subtotaal/subtotal")
                        const totaalMatch = fullText.match(new RegExp('(?:^|[^bu])totaa?l[^€£$]*[€£$]\\s*([\\d.,]+)', 'im'));

                        if (inclMatch) {
                            inv.extractedAmount = parseAmountStr(inclMatch[1]);
                        } else if (teBetalenMatch) {
                            inv.extractedAmount = parseAmountStr(teBetalenMatch[1]);
                        } else if (totaalMatch) {
                            inv.extractedAmount = parseAmountStr(totaalMatch[1]);
                        } else if (amounts.length > 0) {
                            // Fallback: use the largest amount (most likely incl. BTW/VAT)
                            inv.extractedAmount = Math.max(...amounts.map(a => a.value));
                        }

                        // Extract invoice number patterns
                        const invNrPatterns = [
                            /(?:factuurnummer|factuurnr|invoice\s*(?:number|nr|no)|factuur)\s*[:\s#]*\s*([A-Z0-9][\w\-\/\.]{2,20})/i,
                            /(?:kenmerk|referentie|reference)\s*[:\s]*\s*([A-Z0-9][\w\-\/\.]{2,20})/i,
                            /\b([A-Z]{1,4}[\-\/]?\d{4,}[\-\/]?\d*)\b/,  // Common patterns like F-2026001, INV2026-001
                        ];
                        for (const pat of invNrPatterns) {
                            const m = fullText.match(pat);
                            if (m) { inv.extractedInvoiceNr = m[1]; break; }
                        }

                        // Extract date
                        const datePatterns = [
                            /(?:factuurdatum|datum|date|invoice date)\s*[:\s]*\s*(\d{1,2}[\-\/]\d{1,2}[\-\/]\d{4})/i,
                            /(?:factuurdatum|datum|date|invoice date)\s*[:\s]*\s*(\d{4}[\-\/]\d{2}[\-\/]\d{2})/i,
                            /(\d{1,2}[\-\/]\d{1,2}[\-\/]\d{4})/,
                        ];
                        for (const pat of datePatterns) {
                            const m = fullText.match(pat);
                            if (m) {
                                inv.extractedDate = adminParseDate(m[1]);
                                if (inv.extractedDate) break;
                            }
                        }

                        // Extract company/sender name - look near top of document
                        const topText = fullText.slice(0, 300);
                        // Look for B.V., BV, VOF etc. patterns
                        const companyMatch = topText.match(/([A-Z][\w\s&\.]+(?:B\.?V\.?|BV|VOF|V\.O\.F\.|GmbH|ApS|N\.V\.|NV|LLC|Ltd\.?|Limited|Inc\.?|S\.?L\.?|S\.?A\.?))/);
                        if (companyMatch) inv.extractedName = companyMatch[1].trim();

                        // Extract IBAN
                        const ibanMatch = fullText.match(/\b([A-Z]{2}\d{2}\s?[A-Z]{4}\s?\d{4}\s?\d{4}\s?\d{2,4}\s?\d{0,2})\b/);
                        if (ibanMatch) inv.extractedIBAN = ibanMatch[1].replace(/\s/g, '');

                    } catch (e) {
                        // PDF parsing failed for this file, continue with filename-only data
                        console.warn('PDF extract mislukt voor ' + entry.name + ':', e.message);
                    }
                }
                invoices.push(inv);
            }

            // Save all to IndexedDB
            await adminDB.clear('adminInvoices');
            for (const inv of invoices) await adminDB.put('adminInvoices', inv);
            await adminDB.put('adminSettings', { key: 'lastScanDate', value: new Date().toISOString() });
            showToast('✓ ' + invoices.length + ' facturen gescand' + (hasPdfJs ? ' (met inhoud)' : ''));
            _adminInvoicesCache = invoices;
            // Auto-match all open transactions with the new invoice index
            await adminAutoMatchAll();
        }

        async function adminRescanInvoices() {
            if (!_adminFolderHandles.invoices) {
                showToast('⚠️ Kies eerst een facturen-map');
                return;
            }
            try {
                // Re-request permission
                const perm = await _adminFolderHandles.invoices.requestPermission({ mode: 'readwrite' });
                if (perm !== 'granted') { showToast('⚠️ Geen toegang tot map'); return; }
                await adminScanInvoicesFolder(_adminFolderHandles.invoices);
            } catch (e) {
                showToast('⚠️ Scannen mislukt: ' + e.message);
            }
        }

        // --- Transactions folder scanner ---
        async function adminScanTransactionsFolder(dirHandle) {
            showToast('🔍 Transactiebestanden zoeken...');
            const files = [];
            async function scanDir(handle) {
                for await (const entry of handle.values()) {
                    if (entry.kind === 'file') {
                        const ext = entry.name.toLowerCase().split('.').pop();
                        if (['pdf', 'csv', 'xlsx', 'xls'].includes(ext)) files.push(entry);
                    } else if (entry.kind === 'directory') {
                        await scanDir(entry);
                    }
                }
            }
            await scanDir(dirHandle);
            if (files.length === 0) { showToast('⚠️ Geen transactiebestanden gevonden in deze map'); return; }

            // Check which files are already imported
            const existingUploads = await adminDB.getAll('adminUploads');
            const existingNames = new Set(existingUploads.map(u => u.filename));
            const newFiles = files.filter(f => !existingNames.has(f.name));

            if (newFiles.length === 0) {
                showToast('✓ Alle ' + files.length + ' bestanden zijn al ingeladen');
                return;
            }

            showToast('📥 ' + newFiles.length + ' nieuwe bestanden inladen...');
            let imported = 0;
            for (const entry of newFiles) {
                try {
                    const file = await entry.getFile();
                    // Reuse existing import logic via a synthetic input
                    await adminImportFile(file);
                    imported++;
                } catch (e) {
                    console.warn('Import mislukt voor ' + entry.name + ':', e.message);
                }
            }
            showToast('✓ ' + imported + ' transactieoverzichten ingeladen');
            adminRenderUploads();
        }

        // Import a single File object (extracted from adminHandleBankFile for reuse)
        async function adminImportFile(file) {
            let transactions = [];
            const uploadId = crypto.randomUUID();
            const isPdf = file.name.toLowerCase().endsWith('.pdf');

            if (isPdf) {
                transactions = await adminParseBankPdf(file, uploadId);
            } else {
                let rows, headers;
                if (file.name.toLowerCase().endsWith('.csv')) {
                    const text = await file.text();
                    const parsed = adminParseCSV(text);
                    headers = parsed.headers;
                    rows = parsed.rows;
                } else {
                    if (typeof XLSX === 'undefined') return;
                    const data = await file.arrayBuffer();
                    const wb = XLSX.read(data, { type: 'array', cellDates: true });
                    const ws = wb.Sheets[wb.SheetNames[0]];
                    const json = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
                    if (json.length < 2) return;
                    headers = json[0].map(h => String(h).trim());
                    rows = json.slice(1).filter(r => r.some(c => c !== ''));
                }
                const colMap = adminDetectBankFormat(headers);
                if (!colMap) return; // Skip files with unknown format in batch mode
                for (const row of rows) {
                    const rawDate = row[colMap.date];
                    const rawAmount = row[colMap.amount];
                    const desc = String(row[colMap.description] || '');
                    const counterName = colMap.counterName !== undefined ? String(row[colMap.counterName] || '') : '';
                    const counterAccount = colMap.counterAccount !== undefined ? String(row[colMap.counterAccount] || '') : '';
                    const date = adminParseDate(rawDate);
                    const amount = adminParseAmount(rawAmount, colMap.debitCredit !== undefined ? String(row[colMap.debitCredit]) : null);
                    if (!date || isNaN(amount)) continue;
                    transactions.push({ id: crypto.randomUUID(), uploadId, date, amount, description: desc, counterName, counterAccount, invoiceFilename: null, invoicePath: null, status: 'open' });
                }
            }

            if (transactions.length === 0) return;

            const dates = transactions.map(t => t.date).sort();
            const firstMonth = new Date(dates[0]);
            const lastMonth = new Date(dates[dates.length - 1]);
            const months = ['Januari','Februari','Maart','April','Mei','Juni','Juli','Augustus','September','Oktober','November','December'];
            let periodLabel;
            if (firstMonth.getMonth() === lastMonth.getMonth() && firstMonth.getFullYear() === lastMonth.getFullYear()) {
                periodLabel = months[firstMonth.getMonth()] + ' ' + firstMonth.getFullYear();
            } else {
                periodLabel = months[firstMonth.getMonth()] + ' - ' + months[lastMonth.getMonth()] + ' ' + lastMonth.getFullYear();
            }

            const upload = { id: uploadId, filename: file.name, periodLabel, uploadDate: new Date().toISOString(), totalRows: transactions.length, matchedRows: 0, status: 'in_progress' };
            await adminDB.put('adminUploads', upload);
            for (const tx of transactions) await adminDB.put('adminTransactions', tx);
            // Auto-match if invoices are available
            if (_adminInvoicesCache.length > 0) await adminAutoMatchAll();
        }

        // --- Bank file import (single file via input) ---
        function adminImportBankFile() {
            document.getElementById('admin-bank-file-input').click();
        }

        let _adminColMapResolve = null;
        let _adminColMapHeaders = [];

        async function adminHandleBankFile(input) {
            const file = input.files[0];
            if (!file) return;
            input.value = '';
            try {
                await adminImportFile(file);
                adminRenderUploads();
                showToast('✓ Transacties ingeladen');
            } catch (e) {
                console.error('Bank import fout:', e);
                showToast('⚠️ Import mislukt: ' + e.message);
            }
        }

        // --- Bunq PDF parser ---
        async function adminParseBankPdf(file, uploadId) {
            if (typeof pdfjsLib === 'undefined') {
                showToast('⚠️ PDF.js nog niet geladen, probeer opnieuw');
                return [];
            }
            showToast('🔍 PDF verwerken...');
            const arrayBuf = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuf }).promise;

            // Extract text from all pages with position info
            const allItems = [];
            for (let p = 1; p <= pdf.numPages; p++) {
                const page = await pdf.getPage(p);
                const content = await page.getTextContent();
                const viewport = page.getViewport({ scale: 1 });
                for (const item of content.items) {
                    if (!item.str || !item.str.trim()) continue;
                    // Transform y-coordinate (PDF has y=0 at bottom)
                    const tx = item.transform;
                    const x = tx[4];
                    const y = viewport.height - tx[5];
                    allItems.push({
                        text: item.str.trim(),
                        x: Math.round(x),
                        y: Math.round(y),
                        page: p
                    });
                }
            }

            // Group items into rows by y-coordinate (items within 4px = same row)
            allItems.sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
            const rows = [];
            let currentRow = [];
            let lastY = -999;
            let lastPage = -1;
            for (const item of allItems) {
                if (item.page !== lastPage || Math.abs(item.y - lastY) > 4) {
                    if (currentRow.length > 0) rows.push(currentRow);
                    currentRow = [];
                    lastY = item.y;
                    lastPage = item.page;
                }
                currentRow.push(item);
            }
            if (currentRow.length > 0) rows.push(currentRow);

            // Parse transactions from rows
            // Bunq format: rows starting with a date YYYY-MM-DD contain transaction data
            const transactions = [];
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            const amountRegex = /^[+\-]\s*€\s*[\d.,]+$/;

            let i = 0;
            while (i < rows.length) {
                const row = rows[i];
                // Check if first item is a date
                const firstText = row[0].text;
                if (!dateRegex.test(firstText)) { i++; continue; }

                // This is a transaction row · extract columns by x-position
                const date = firstText;
                // Find the amount (rightmost item, matches +/- € pattern)
                let amount = null;
                let amountIdx = -1;
                // Amount is typically the rightmost column
                // Collect all text items in this logical row, including continuation lines
                const txItems = [...row];

                // Look ahead for continuation lines (lines that don't start with a date and aren't headers)
                let j = i + 1;
                while (j < rows.length) {
                    const nextRow = rows[j];
                    const nextFirst = nextRow[0].text;
                    // Stop if next row starts with a date or is a header/footer
                    if (dateRegex.test(nextFirst)) break;
                    if (nextFirst === 'Datum' || nextFirst.startsWith('Transactieoverzicht') || nextFirst.startsWith('Aan dit overzicht') || nextFirst.startsWith('Dit product')) break;
                    if (nextFirst === 'Download datum:') break;
                    txItems.push(...nextRow);
                    j++;
                }

                // Sort items by x-position to find columns
                const sortedByX = [...txItems].sort((a, b) => a.x - b.x);

                // Find amount: look for +/- € pattern
                for (const item of txItems) {
                    const m = item.text.match(/^([+\-])\s*€\s*([\d.,]+)$/);
                    if (m) {
                        let amtStr = m[2].replace(/\./g, '').replace(',', '.');
                        amount = parseFloat(amtStr);
                        if (m[1] === '-') amount = -amount;
                        break;
                    }
                }

                // If no amount found, try combining last items
                if (amount === null) {
                    // Sometimes the sign, € symbol, and number are separate items
                    const texts = txItems.map(t => t.text);
                    const fullText = texts.join(' ');
                    const amMatch = fullText.match(/([+\-])\s*€\s*([\d.,]+)/);
                    if (amMatch) {
                        let amtStr = amMatch[2].replace(/\./g, '').replace(',', '.');
                        amount = parseFloat(amtStr);
                        if (amMatch[1] === '-') amount = -amount;
                    }
                }

                if (amount === null || isNaN(amount)) { i = j; continue; }

                // Extract counterparty and description
                // In Bunq PDFs, columns are roughly: Datum | Rentedatum | Tegenrekening | Omschrijving | Bedrag
                // Group by approximate x-ranges
                const nonDateItems = txItems.filter(t => !dateRegex.test(t.text) && !t.text.match(/^[+\-]\s*€/));

                // Find IBAN in the text (tegenrekening)
                let counterAccount = '';
                let counterName = '';
                let description = '';
                const ibanRegex = /^[A-Z]{2}\d{2}[A-Z]{4}\d{4,}$/;

                const allTexts = nonDateItems.map(t => t.text);

                // Separate counter info from description by x-position
                // Counter info is typically in the 3rd column area, description in the 4th
                // Get the x-positions of the date columns to determine column boundaries
                const dateItems = txItems.filter(t => dateRegex.test(t.text));
                let counterTexts = [];
                let descTexts = [];

                if (dateItems.length >= 2) {
                    // We have datum + rentedatum, so column 3 starts after them
                    // Sort non-date, non-amount items by x-position
                    const contentItems = nonDateItems.sort((a, b) => a.x - b.x);
                    // Try to find a natural x-gap that separates counter from description
                    // Tegenrekening is typically around x=200-300, Omschrijving around x=350+
                    // Use a heuristic: find the median x and split
                    if (contentItems.length > 0) {
                        const xs = contentItems.map(t => t.x);
                        const minX = Math.min(...xs);
                        const maxX = Math.max(...xs);
                        const midX = (minX + maxX) / 2;

                        // Find the biggest gap in x-positions
                        const uniqueXs = [...new Set(xs)].sort((a, b) => a - b);
                        let bestGap = 0, splitX = midX;
                        for (let k = 1; k < uniqueXs.length; k++) {
                            const gap = uniqueXs[k] - uniqueXs[k-1];
                            if (gap > bestGap && gap > 30) { bestGap = gap; splitX = (uniqueXs[k] + uniqueXs[k-1]) / 2; }
                        }

                        counterTexts = contentItems.filter(t => t.x < splitX).map(t => t.text);
                        descTexts = contentItems.filter(t => t.x >= splitX).map(t => t.text);
                    }
                }

                // If splitting didn't work well, use all text as description
                if (counterTexts.length === 0 && descTexts.length === 0) {
                    descTexts = allTexts;
                }

                // Extract IBAN from counter texts
                for (const t of counterTexts) {
                    if (ibanRegex.test(t)) {
                        counterAccount = t;
                    } else if (!counterAccount || counterTexts.indexOf(t) < counterTexts.indexOf(counterAccount)) {
                        // Name is typically before the IBAN
                        if (!ibanRegex.test(t)) {
                            counterName += (counterName ? ' ' : '') + t;
                        }
                    }
                }

                // If no IBAN found in counter, check all texts
                if (!counterAccount) {
                    for (const t of allTexts) {
                        if (ibanRegex.test(t)) { counterAccount = t; break; }
                    }
                }

                // If counterName is empty, use first non-IBAN counter text or first desc text
                if (!counterName && counterTexts.length > 0) {
                    counterName = counterTexts.filter(t => !ibanRegex.test(t)).join(' ');
                }
                if (!counterName && descTexts.length > 0) {
                    counterName = descTexts[0];
                }

                description = descTexts.join(' ');

                // Clean up: remove IBAN from counterName if it slipped in
                counterName = counterName.replace(/\b[A-Z]{2}\d{2}[A-Z]{4}\d{4,}\b/g, '').trim();

                transactions.push({
                    id: crypto.randomUUID(),
                    uploadId,
                    date,
                    amount,
                    description: description.slice(0, 500),
                    counterName: counterName.slice(0, 200),
                    counterAccount,
                    invoiceFilename: null,
                    invoicePath: null,
                    status: 'open'
                });

                i = j;
            }

            return transactions;
        }

        function adminParseCSV(text) {
            // Handle semicolon-separated (Dutch standard) and comma-separated
            const lines = text.split(/\r?\n/).filter(l => l.trim());
            if (lines.length < 2) return { headers: [], rows: [] };
            const sep = lines[0].includes(';') ? ';' : ',';
            const parseRow = (line) => {
                const result = [];
                let current = '';
                let inQuotes = false;
                for (let i = 0; i < line.length; i++) {
                    const ch = line[i];
                    if (ch === '"') { inQuotes = !inQuotes; }
                    else if (ch === sep && !inQuotes) { result.push(current.trim()); current = ''; }
                    else { current += ch; }
                }
                result.push(current.trim());
                return result;
            };
            const headers = parseRow(lines[0]);
            const rows = lines.slice(1).map(parseRow);
            return { headers, rows };
        }

        function adminDetectBankFormat(headers) {
            const h = headers.map(x => String(x).toLowerCase().trim());
            // ING
            if (h.includes('datum') && h.includes('naam / omschrijving') && h.includes('bedrag (eur)')) {
                return {
                    date: h.indexOf('datum'),
                    description: h.indexOf('mededelingen') !== -1 ? h.indexOf('mededelingen') : h.indexOf('naam / omschrijving'),
                    amount: h.indexOf('bedrag (eur)'),
                    counterName: h.indexOf('naam / omschrijving'),
                    counterAccount: h.indexOf('tegenrekening'),
                    debitCredit: h.indexOf('af bij')
                };
            }
            // Rabobank
            if (h.includes('datum') && h.includes('naam tegenpartij') && h.includes('bedrag')) {
                return {
                    date: h.indexOf('datum'),
                    description: h.indexOf('omschrijving') !== -1 ? h.indexOf('omschrijving') : h.indexOf('naam tegenpartij'),
                    amount: h.indexOf('bedrag'),
                    counterName: h.indexOf('naam tegenpartij'),
                    counterAccount: h.indexOf('rekening tegenpartij') !== -1 ? h.indexOf('rekening tegenpartij') : undefined
                };
            }
            // ABN AMRO
            if (h.includes('transactiedatum') && h.includes('bedrag') && h.includes('naam')) {
                return {
                    date: h.indexOf('transactiedatum'),
                    description: h.indexOf('omschrijving') !== -1 ? h.indexOf('omschrijving') : h.indexOf('naam'),
                    amount: h.indexOf('bedrag'),
                    counterName: h.indexOf('naam'),
                    counterAccount: undefined
                };
            }
            // Generic fallback: look for common column names
            const dateIdx = h.findIndex(x => x === 'datum' || x === 'date' || x === 'boekdatum');
            const amountIdx = h.findIndex(x => x === 'bedrag' || x === 'amount' || x === 'bedrag (eur)');
            const descIdx = h.findIndex(x => x === 'omschrijving' || x === 'description' || x === 'mededelingen');
            if (dateIdx !== -1 && amountIdx !== -1) {
                return { date: dateIdx, amount: amountIdx, description: descIdx !== -1 ? descIdx : dateIdx };
            }
            return null; // Unknown format
        }

        function adminShowColMapUI(headers) {
            return new Promise((resolve) => {
                _adminColMapHeaders = headers;
                _adminColMapResolve = resolve;
                const fields = [
                    { key: 'date', label: 'Datum', required: true },
                    { key: 'amount', label: 'Bedrag', required: true },
                    { key: 'description', label: 'Omschrijving', required: true },
                    { key: 'counterName', label: 'Naam tegenpartij', required: false },
                    { key: 'counterAccount', label: 'Rekening tegenpartij', required: false },
                    { key: 'debitCredit', label: 'Af/Bij kolom', required: false }
                ];
                const container = document.getElementById('admin-colmap-fields');
                container.innerHTML = fields.map(f => `
                    <div class="form-group" style="margin-bottom:10px">
                        <label style="font-size:0.82rem;font-weight:600">${f.label}${f.required ? ' *' : ''}</label>
                        <select id="admin-colmap-${f.key}" style="width:100%;padding:8px;border:2px solid var(--app-line);border-radius:8px;font-size:0.85rem">
                            <option value="">-- Kies kolom --</option>
                            ${headers.map((h, i) => '<option value="' + i + '">' + h + '</option>').join('')}
                        </select>
                    </div>
                `).join('');
                document.getElementById('admin-colmap-modal').classList.add('active');
            });
        }

        function adminConfirmColMap() {
            const mapping = {};
            const dateVal = document.getElementById('admin-colmap-date').value;
            const amountVal = document.getElementById('admin-colmap-amount').value;
            const descVal = document.getElementById('admin-colmap-description').value;
            if (dateVal === '' || amountVal === '' || descVal === '') {
                showToast('⚠️ Datum, bedrag en omschrijving zijn verplicht');
                return;
            }
            mapping.date = parseInt(dateVal);
            mapping.amount = parseInt(amountVal);
            mapping.description = parseInt(descVal);
            const cn = document.getElementById('admin-colmap-counterName').value;
            if (cn !== '') mapping.counterName = parseInt(cn);
            const ca = document.getElementById('admin-colmap-counterAccount').value;
            if (ca !== '') mapping.counterAccount = parseInt(ca);
            const dc = document.getElementById('admin-colmap-debitCredit').value;
            if (dc !== '') mapping.debitCredit = parseInt(dc);
            closeModal('admin-colmap-modal');
            if (_adminColMapResolve) _adminColMapResolve(mapping);
            _adminColMapResolve = null;
        }

        function adminParseDate(val) {
            if (!val) return null;
            const s = String(val).trim();
            // YYYYMMDD
            if (/^\d{8}$/.test(s)) return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8);
            // DD-MM-YYYY or DD/MM/YYYY
            const m1 = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
            if (m1) return m1[3] + '-' + m1[2].padStart(2, '0') + '-' + m1[1].padStart(2, '0');
            // YYYY-MM-DD
            const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (m2) return m2[1] + '-' + m2[2] + '-' + m2[3];
            // Date object (from SheetJS)
            if (val instanceof Date && !isNaN(val)) {
                return val.getFullYear() + '-' + String(val.getMonth()+1).padStart(2,'0') + '-' + String(val.getDate()).padStart(2,'0');
            }
            return null;
        }

        function adminParseAmount(val, debitCreditFlag) {
            if (val == null) return NaN;
            let s = String(val).trim();
            // Remove currency symbols
            s = s.replace(/[€$]/g, '').trim();
            // Handle Dutch format: 1.234,56
            if (s.includes(',') && s.includes('.')) {
                s = s.replace(/\./g, '').replace(',', '.');
            } else if (s.includes(',') && !s.includes('.')) {
                s = s.replace(',', '.');
            }
            let amount = parseFloat(s);
            if (isNaN(amount)) return NaN;
            // Handle debit/credit column (ING style: "Af" = negative, "Bij" = positive)
            if (debitCreditFlag) {
                const dc = debitCreditFlag.toLowerCase().trim();
                if (dc === 'af' && amount > 0) amount = -amount;
                if (dc === 'bij' && amount < 0) amount = -amount;
            }
            return amount;
        }

        // --- Screen loading ---
        let _adminInvoicesCache = [];
        let _adminCurrentUpload = null;
        let _adminCurrentTxs = [];
        let _adminCurrentTxIdx = 0;
        let _adminSelectedInvoices = new Set();
        let _adminTxFilter = 'all';

        async function adminLoadScreen() {
            try {
                await openAdminDB();
                _adminInvoicesCache = await adminDB.getAll('adminInvoices');
                adminRenderUploads();
                // Restore saved folder handles
                await adminRestoreFolderHandles();
            } catch (e) {
                console.error('AdminLoadScreen fout:', e);
            }
        }

        // --- Account labels ---
        const ADMIN_ACCOUNT_LABELS = {};
        let _adminCurrentAccount = null;

        function adminExtractAccount(filename) {
            const m = filename.match(/(NL\d{2}[A-Z]{4}\d+)/i);
            return m ? m[1].toUpperCase() : 'onbekend';
        }

        function adminAccountLabel(iban) {
            if (ADMIN_ACCOUNT_LABELS[iban]) return ADMIN_ACCOUNT_LABELS[iban];
            const last2 = iban.slice(-2);
            if (last2 === '08') return 'Hoofdrekening';
            if (last2 === '69') return 'BTW rekening';
            return 'Rekening …' + last2;
        }

        async function adminRenderUploads() {
            const uploads = await adminDB.getAll('adminUploads');
            const list = document.getElementById('admin-accounts-list');
            if (uploads.length === 0) {
                list.innerHTML = '<div style="text-align:center;padding:24px;color:var(--muted);font-size:0.85rem">Nog geen transactieoverzichten ingeladen.<br>Kies een <b>Transacties-map</b> hierboven om bankafschriften in te laden.</div>';
                return;
            }
            // Group by account
            const accounts = {};
            for (const u of uploads) {
                const iban = adminExtractAccount(u.filename);
                if (!accounts[iban]) accounts[iban] = { iban, uploads: [], totalRows: 0, matchedRows: 0 };
                accounts[iban].uploads.push(u);
                accounts[iban].totalRows += u.totalRows;
                accounts[iban].matchedRows += u.matchedRows;
            }
            const sorted = Object.values(accounts).sort((a, b) => a.iban.localeCompare(b.iban));
            list.innerHTML = sorted.map(acc => {
                const pct = acc.totalRows > 0 ? Math.round((acc.matchedRows / acc.totalRows) * 100) : 0;
                const done = acc.matchedRows === acc.totalRows && acc.totalRows > 0;
                const label = adminAccountLabel(acc.iban);
                const last4 = acc.iban.length >= 4 ? acc.iban.slice(-4) : acc.iban;
                return `
                    <div class="admin-upload-card ${done ? 'completed' : ''}" onclick="adminOpenAccount('${acc.iban}')" style="cursor:pointer">
                        <div style="flex:1;min-width:0">
                            <div style="font-weight:600;font-size:0.95rem">🏦 ${label}</div>
                            <div style="font-size:0.75rem;color:var(--muted)">…${last4} · ${acc.uploads.length} overzicht${acc.uploads.length !== 1 ? 'en' : ''} · ${acc.matchedRows}/${acc.totalRows} verwerkt</div>
                        </div>
                        <div class="admin-progress-bar" style="max-width:80px">
                            <div class="admin-progress-fill" style="width:${pct}%"></div>
                        </div>
                        <div style="font-size:0.8rem;font-weight:600;color:${done ? 'var(--green)' : 'var(--muted)'}">
                            ${done ? '✅' : pct + '%'} ▶
                        </div>
                    </div>
                `;
            }).join('');
        }

        async function adminOpenAccount(iban) {
            _adminCurrentAccount = iban;
            const uploads = await adminDB.getAll('adminUploads');
            const filtered = uploads.filter(u => adminExtractAccount(u.filename) === iban);
            filtered.sort((a, b) => b.uploadDate.localeCompare(a.uploadDate));
            const list = document.getElementById('admin-uploads-list');
            document.getElementById('admin-account-title').textContent = adminAccountLabel(iban) + ' (…' + iban.slice(-4) + ')';
            list.innerHTML = filtered.map(u => {
                const pct = u.totalRows > 0 ? Math.round((u.matchedRows / u.totalRows) * 100) : 0;
                const done = u.matchedRows === u.totalRows;
                return `
                    <div class="admin-upload-card ${done ? 'completed' : ''}" onclick="adminOpenUpload('${u.id}')">
                        <div style="flex:1;min-width:0">
                            <div style="font-weight:600;font-size:0.9rem">${u.periodLabel}</div>
                            <div style="font-size:0.75rem;color:var(--muted)">${u.matchedRows}/${u.totalRows} verwerkt · ${u.filename}</div>
                        </div>
                        <div class="admin-progress-bar" style="max-width:80px">
                            <div class="admin-progress-fill" style="width:${pct}%"></div>
                        </div>
                        <button onclick="event.stopPropagation(); adminDeleteUpload('${u.id}')" style="background:var(--app-alert-soft);color:var(--app-alert);border:none;border-radius:8px;padding:6px 8px;cursor:pointer;font-size:0.9rem;margin-left:6px" title="Verwijderen">🗑️</button>
                        <div style="font-size:0.8rem;font-weight:600;color:${done ? 'var(--green)' : 'var(--muted)'}">
                            ${done ? '✅' : pct + '%'} ▶
                        </div>
                    </div>
                `;
            }).join('');
            document.getElementById('admin-main-view').style.display = 'none';
            document.getElementById('admin-account-view').style.display = '';
        }

        function adminBackToAccounts() {
            document.getElementById('admin-account-view').style.display = 'none';
            document.getElementById('admin-main-view').style.display = '';
            _adminCurrentAccount = null;
            adminRenderUploads();
        }

        async function adminDeleteUpload(uploadId) {
            if (!confirm('Weet je zeker dat je dit transactieoverzicht wilt verwijderen? Alle koppelingen gaan verloren.')) return;
            // Delete all transactions for this upload
            const txs = await adminDB.getAllByIndex('adminTransactions', 'uploadId', uploadId);
            for (const tx of txs) {
                // Unlink any linked invoices
                if (tx.invoiceFilename) {
                    const inv = _adminInvoicesCache.find(i => i.filename === tx.invoiceFilename);
                    if (inv) { inv.linkedToTransaction = null; await adminDB.put('adminInvoices', inv); }
                }
                await adminDB.delete('adminTransactions', tx.id);
            }
            await adminDB.delete('adminUploads', uploadId);
            showToast('🗑️ Overzicht verwijderd');
            if (_adminCurrentAccount) {
                adminOpenAccount(_adminCurrentAccount);
            } else {
                adminRenderUploads();
            }
        }

        // --- Wizard ---
        let _adminListFilter = 'all';

        async function adminOpenUpload(uploadId) {
            _adminCurrentUpload = await adminDB.get('adminUploads', uploadId);
            if (!_adminCurrentUpload) return;
            // Refresh invoice cache to get latest linkedToTransaction state
            _adminInvoicesCache = await adminDB.getAll('adminInvoices');
            _adminCurrentTxs = await adminDB.getAllByIndex('adminTransactions', 'uploadId', uploadId);
            _adminCurrentTxs.sort((a, b) => a.date.localeCompare(b.date));
            _adminCurrentTxIdx = 0;
            _adminTxFilter = 'all';
            _adminListFilter = 'all';
            _adminSelectedInvoices = new Set();
            // Check for duplicate invoice links across all transactions
            await adminCheckDuplicateLinks();
            // Show list view (not wizard)
            document.getElementById('admin-main-view').style.display = 'none';
            document.getElementById('admin-account-view').style.display = 'none';
            document.getElementById('admin-wizard-view').style.display = 'none';
            document.getElementById('admin-list-view').style.display = '';
            // Reset filter chips
            document.querySelectorAll('#admin-list-filter-chips .admin-filter-chip').forEach(c => c.classList.remove('active'));
            document.querySelector('#admin-list-filter-chips .admin-filter-chip').classList.add('active');
            const searchEl = document.getElementById('admin-list-search');
            if (searchEl) searchEl.value = '';
            adminRenderListView();
        }

        async function adminCheckDuplicateLinks() {
            // Find invoices linked to multiple transactions across all uploads
            const allTxs = await adminDB.getAll('adminTransactions');
            const invoiceUsage = {}; // filename -> [{ txId, counterName, date, uploadId }]
            for (const tx of allTxs) {
                if (tx.status !== 'matched') continue;
                const fnames = tx.invoiceFilenames || (tx.invoiceFilename ? [tx.invoiceFilename] : []);
                for (const fn of fnames) {
                    if (!fn) continue;
                    if (!invoiceUsage[fn]) invoiceUsage[fn] = [];
                    invoiceUsage[fn].push({ txId: tx.id, name: tx.counterName || tx.description.slice(0, 30), date: tx.date, uploadId: tx.uploadId });
                }
            }
            const duplicates = Object.entries(invoiceUsage).filter(([fn, usages]) => usages.length > 1);
            if (duplicates.length > 0) {
                const msgs = duplicates.map(([fn, usages]) => {
                    return '⚠️ ' + fn + ' is ' + usages.length + 'x gekoppeld:\n' + usages.map(u => '   • ' + u.date + ' ·' + u.name).join('\n');
                });
                showToast('⚠️ ' + duplicates.length + ' factuur/facturen dubbel gekoppeld!', 8000);
                console.warn('Dubbel gekoppelde facturen:\n' + msgs.join('\n\n'));
                // Mark duplicates visually in the list view
                _adminDuplicateInvoices = new Set(duplicates.map(([fn]) => fn));
            } else {
                _adminDuplicateInvoices = new Set();
            }
        }
        let _adminDuplicateInvoices = new Set();

        function adminBackToMain() {
            document.getElementById('admin-wizard-view').style.display = 'none';
            document.getElementById('admin-list-view').style.display = 'none';
            _adminCurrentUpload = null;
            if (_adminCurrentAccount) {
                document.getElementById('admin-account-view').style.display = '';
                adminOpenAccount(_adminCurrentAccount);
            } else {
                document.getElementById('admin-main-view').style.display = '';
                adminRenderUploads();
            }
        }

        function adminBackToList() {
            document.getElementById('admin-list-view').style.display = '';
            document.getElementById('admin-wizard-view').style.display = 'none';
            adminRenderListView();
        }

        function adminListFilter(filter) {
            _adminListFilter = filter;
            document.querySelectorAll('#admin-list-filter-chips .admin-filter-chip').forEach(c => c.classList.remove('active'));
            event.target.classList.add('active');
            adminRenderListView();
        }

        function adminRenderListView() {
            // Stats
            const stats = { total: _adminCurrentTxs.length, open: 0, matched: 0, no_invoice: 0, skipped: 0 };
            for (const tx of _adminCurrentTxs) stats[tx.status] = (stats[tx.status] || 0) + 1;
            document.getElementById('admin-list-stats').innerHTML = `
                <div class="admin-stat-card" style="background:var(--app-ok-soft);color:var(--app-ok)"><span class="stat-num">${stats.matched}</span>Gekoppeld</div>
                <div class="admin-stat-card" style="background:var(--app-warn-soft);color:var(--app-warn)"><span class="stat-num">${stats.open}</span>Open</div>
                <div class="admin-stat-card" style="background:var(--app-bg-tint);color:var(--muted)"><span class="stat-num">${stats.no_invoice}</span>Geen fact.</div>
                <div class="admin-stat-card" style="background:var(--app-bg-tint);color:var(--muted)"><span class="stat-num">${stats.skipped}</span>Overgesl.</div>
            `;

            // Filter
            let txs = _adminListFilter === 'all' ? _adminCurrentTxs : _adminCurrentTxs.filter(t => t.status === _adminListFilter);

            // Search
            const searchVal = (document.getElementById('admin-list-search')?.value || '').toLowerCase().trim();
            if (searchVal.length >= 2) {
                txs = txs.filter(t =>
                    t.counterName.toLowerCase().includes(searchVal) ||
                    t.description.toLowerCase().includes(searchVal) ||
                    t.date.includes(searchVal) ||
                    String(t.amount).includes(searchVal) ||
                    (t.invoiceFilename && t.invoiceFilename.toLowerCase().includes(searchVal)) ||
                    (t.category && t.category.toLowerCase().includes(searchVal))
                );
            }

            const container = document.getElementById('admin-list-items');
            if (txs.length === 0) {
                container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:0.85rem">Geen transacties gevonden</div>';
                return;
            }

            container.innerHTML = txs.map((tx, i) => {
                const d = tx.date.split('-');
                const dateStr = d[2] + '-' + d[1];
                const absAmt = Math.abs(tx.amount);
                const amtStr = (tx.amount < 0 ? '-' : '+') + '€' + absAmt.toLocaleString('nl-NL', { minimumFractionDigits: 2 });
                const amtColor = tx.amount < 0 ? '#dc2626' : '#16a34a';
                const name = tx.counterName || tx.description.slice(0, 30);
                const globalIdx = _adminCurrentTxs.indexOf(tx);

                let rightHtml = '';
                if (tx.status === 'matched' && tx.invoicePath) {
                    rightHtml = '<button class="btn btn-sm" onclick="event.stopPropagation(); adminPreviewInvoice(\'' + tx.invoicePath.replace(/'/g, "\\'") + '\')" style="font-size:1.15rem;padding:8px 12px;background:var(--app-ok-soft);border:none;border-radius:6px;cursor:pointer" title="Factuur bekijken">👁️</button>';
                }

                let statusIcon = '';
                if (tx.status === 'matched') {
                    const fnames = tx.invoiceFilenames || (tx.invoiceFilename ? [tx.invoiceFilename] : []);
                    const hasDup = fnames.some(fn => _adminDuplicateInvoices.has(fn));
                    if (hasDup) {
                        statusIcon = '<span style="font-size:0.7rem;color:#dc2626;font-weight:600">⚠️ DUBBEL: ' + fnames.map(f => f.slice(0, 20)).join(', ') + '</span>';
                    } else {
                        statusIcon = '<span style="font-size:0.7rem;color:#16a34a">✅ ' + fnames.map(f => f.slice(0, 20)).join(', ') + '</span>';
                    }
                }
                else if (tx.status === 'no_invoice') {
                    const cat = tx.category ? ADMIN_CATEGORIES.find(c => c.id === tx.category) : null;
                    statusIcon = '<span style="font-size:0.7rem;color:var(--muted)">' + (cat ? cat.label : 'Geen factuur') + '</span>';
                }
                else if (tx.status === 'skipped') statusIcon = '<span style="font-size:0.7rem;color:var(--muted)">Overgeslagen</span>';

                return `<div class="admin-list-row status-${tx.status}" onclick="adminOpenTxFromList(${globalIdx})">
                    <div style="font-size:0.75rem;color:var(--muted);min-width:42px">${dateStr}</div>
                    <div style="flex:1;min-width:0">
                        <div style="font-weight:600;font-size:0.82rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${name}</div>
                        ${statusIcon ? '<div>' + statusIcon + '</div>' : ''}
                    </div>
                    <div style="font-weight:700;font-size:0.82rem;color:${amtColor};white-space:nowrap;margin-right:4px">${amtStr}</div>
                    ${rightHtml}
                </div>`;
            }).join('');
        }

        function adminOpenTxFromList(globalIdx) {
            _adminCurrentTxIdx = 0;
            _adminTxFilter = 'all';
            _adminSelectedInvoices = new Set();
            // Find the index in the filtered list
            _adminCurrentTxIdx = globalIdx;
            document.getElementById('admin-list-view').style.display = 'none';
            document.getElementById('admin-wizard-view').style.display = '';
            // Reset wizard filter chips
            document.querySelectorAll('#admin-filter-chips .admin-filter-chip').forEach(c => c.classList.remove('active'));
            document.querySelector('#admin-filter-chips .admin-filter-chip').classList.add('active');
            adminRenderCurrentTx();
        }

        function adminGetFilteredTxs() {
            if (_adminTxFilter === 'all') return _adminCurrentTxs;
            return _adminCurrentTxs.filter(t => t.status === _adminTxFilter);
        }

        function adminFilterTx(filter) {
            _adminTxFilter = filter;
            _adminCurrentTxIdx = 0;
            document.querySelectorAll('#admin-filter-chips .admin-filter-chip').forEach(c => c.classList.remove('active'));
            event.target.classList.add('active');
            adminRenderCurrentTx();
        }

        function adminWizardNav(dir) {
            const filtered = adminGetFilteredTxs();
            _adminCurrentTxIdx = Math.max(0, Math.min(filtered.length - 1, _adminCurrentTxIdx + dir));
            _adminSelectedInvoices = new Set();
            adminRenderCurrentTx();
        }

        function adminRenderCurrentTx() {
            const filtered = adminGetFilteredTxs();
            const counter = document.getElementById('admin-wizard-counter');
            if (filtered.length === 0) {
                counter.textContent = '0 / 0';
                document.getElementById('admin-tx-card').style.display = 'none';
                document.getElementById('admin-suggestions').innerHTML = '<div style="text-align:center;padding:16px;color:var(--muted);font-size:0.85rem">Geen transacties in deze filter</div>';
                return;
            }
            document.getElementById('admin-tx-card').style.display = '';
            if (_adminCurrentTxIdx >= filtered.length) _adminCurrentTxIdx = filtered.length - 1;
            const tx = filtered[_adminCurrentTxIdx];
            counter.textContent = (_adminCurrentTxIdx + 1) + ' / ' + filtered.length;

            // Render tx card
            const d = tx.date.split('-');
            document.getElementById('admin-tx-date').textContent = '📅 ' + d[2] + '-' + d[1] + '-' + d[0];
            document.getElementById('admin-tx-name').textContent = tx.counterName || tx.description.slice(0, 40);
            document.getElementById('admin-tx-desc').textContent = '📝 ' + tx.description;
            const amountEl = document.getElementById('admin-tx-amount');
            const formatted = (tx.amount < 0 ? '-' : '+') + '€ ' + Math.abs(tx.amount).toLocaleString('nl-NL', { minimumFractionDigits: 2 });
            amountEl.textContent = formatted;
            amountEl.className = 'admin-tx-amount ' + (tx.amount < 0 ? 'negative' : 'positive');

            // Status badge
            const badgeEl = document.getElementById('admin-tx-status-badge');
            if (tx.status === 'matched') {
                const fnames = tx.invoiceFilenames || (tx.invoiceFilename ? [tx.invoiceFilename] : []);
                badgeEl.innerHTML = '<span class="status-badge status-approved">✅ Gekoppeld: ' + fnames.join(', ') + '</span>';
            } else if (tx.status === 'no_invoice') {
                const cat = tx.category ? ADMIN_CATEGORIES.find(c => c.id === tx.category) : null;
                badgeEl.innerHTML = '<span class="status-badge status-draft">' + (cat ? cat.label : '📝 Geen factuur') + '</span>';
            } else if (tx.status === 'skipped') {
                badgeEl.innerHTML = '<span class="status-badge status-pending">Overgeslagen</span>';
            } else {
                badgeEl.innerHTML = '';
            }

            // Hide category picker on navigation
            document.getElementById('admin-category-picker').style.display = 'none';

            // Render suggestions
            _adminSelectedInvoices = new Set();
            if (tx.status === 'matched') {
                // Support both old (string) and new (array) format
                if (Array.isArray(tx.invoiceFilenames)) tx.invoiceFilenames.forEach(f => _adminSelectedInvoices.add(f));
                else if (tx.invoiceFilename) _adminSelectedInvoices.add(tx.invoiceFilename);
            }
            adminRenderSuggestions(tx);

            // Update link/unlink buttons
            document.getElementById('admin-btn-link').disabled = _adminSelectedInvoices.size === 0;
            document.getElementById('admin-btn-unlink').style.display = tx.status === 'matched' ? '' : 'none';
        }

        function adminRenderSuggestions(tx) {
            const container = document.getElementById('admin-suggestions');
            if (_adminInvoicesCache.length === 0) {
                container.innerHTML = '<div style="text-align:center;padding:12px;color:var(--muted);font-size:0.82rem">Geen facturen geïndexeerd. Kies eerst een facturen-map.</div>';
                return;
            }

            // Filter out invoices already linked to OTHER transactions
            const available = _adminInvoicesCache.filter(inv =>
                !inv.linkedToTransaction || inv.linkedToTransaction === tx.id
            );

            // Score invoices using the smart matching function
            const scored = available.map(inv => {
                const score = adminScoreMatch(tx, inv);
                return { ...inv, score };
            });

            // Sort by score descending, take top 10
            scored.sort((a, b) => b.score - a.score);
            const top = scored.filter(s => s.score > 0).slice(0, 10);

            if (top.length === 0) {
                container.innerHTML = '<div style="text-align:center;padding:12px;color:var(--muted);font-size:0.82rem">Geen overeenkomsten gevonden. Gebruik de zoekbalk.</div>';
                return;
            }

            container.innerHTML = top.map(inv => adminRenderInvoiceCard(inv, tx)).join('');
        }

        function adminRenderInvoiceCard(inv, tx) {
            // Build subtitle: amount + company name (from PDF), no filename repeat
            const infoParts = [];
            if (inv.extractedAmount) infoParts.push('€ ' + inv.extractedAmount.toLocaleString('nl-NL', {minimumFractionDigits:2}));
            // extractedName komt uit PDF-inhoud van derden · altijd escapen
            if (inv.extractedName) infoParts.push(escapeHtml(inv.extractedName.slice(0, 35)));
            if (infoParts.length === 0 && inv.quarterFolder) infoParts.push(escapeHtml(inv.quarterFolder));
            const subtitleHtml = infoParts.length > 0 ? '<div style="font-size:0.75rem;color:var(--muted);margin-top:1px">' + infoParts.join(' · ') + '</div>' : '';

            // Match tags (only if tx provided)
            let tagsHtml = '';
            if (tx) {
                const tags = [];
                const absAmt = Math.abs(tx.amount);
                if (inv.extractedAmount && Math.abs(inv.extractedAmount - absAmt) < 0.02) tags.push('💰 Bedrag');
                else if (inv.extractedAmounts && inv.extractedAmounts.some(a => Math.abs(a - absAmt) < 0.02)) tags.push('💰 Bedrag');
                if (inv.extractedInvoiceNr && (tx.description + ' ' + tx.counterName).toLowerCase().includes(inv.extractedInvoiceNr.toLowerCase())) tags.push('🔢 Nr');
                if (inv.extractedIBAN && tx.counterAccount && inv.extractedIBAN === tx.counterAccount.replace(/\s/g, '')) tags.push('🏦 IBAN');
                if (inv.extractedName && tx.counterName) {
                    const invN = inv.extractedName.toLowerCase();
                    const txN = tx.counterName.toLowerCase();
                    if (txN.length >= 4 && (invN.includes(txN.slice(0,5)) || txN.includes(invN.slice(0,5)))) tags.push('🏢 Naam');
                }
                if (tags.length > 0) tagsHtml = '<div style="display:flex;gap:4px;margin-top:3px">' + tags.map(t => '<span style="font-size:0.65rem;background:var(--app-info-soft);color:var(--app-info);padding:1px 6px;border-radius:4px">' + t + '</span>').join('') + '</div>';
            }

            return `
                <div class="admin-suggestion ${_adminSelectedInvoices.has(inv.filename) ? 'selected' : ''}"
                     onclick="adminSelectInvoice('${escapeHtml(inv.filename.replace(/'/g, "\\'"))}')">
                    <span style="font-size:1.1rem">${_adminSelectedInvoices.has(inv.filename) ? '☑️' : '⬜'}</span>
                    <div style="flex:1;min-width:0">
                        <div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.85rem">${escapeHtml(inv.filename)}</div>
                        ${subtitleHtml}${tagsHtml}
                    </div>
                    <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); adminPreviewInvoice('${escapeHtml(inv.path.replace(/'/g, "\\'"))}')" style="font-size:1.35rem;padding:10px 14px;min-width:50px">👁️</button>
                </div>`;
        }

        function adminSearchInvoices(query) {
            if (!query || query.length < 2) {
                const filtered = adminGetFilteredTxs();
                if (filtered.length > 0) adminRenderSuggestions(filtered[_adminCurrentTxIdx]);
                return;
            }
            const q = query.toLowerCase();
            const filtered = adminGetFilteredTxs();
            const currentTx = filtered.length > 0 ? filtered[_adminCurrentTxIdx] : null;
            const results = _adminInvoicesCache.filter(inv =>
                // Exclude invoices linked to OTHER transactions
                (!inv.linkedToTransaction || (currentTx && inv.linkedToTransaction === currentTx.id)) &&
                (inv.filename.toLowerCase().includes(q) ||
                inv.path.toLowerCase().includes(q) ||
                (inv.extractedName && inv.extractedName.toLowerCase().includes(q)) ||
                (inv.extractedInvoiceNr && inv.extractedInvoiceNr.toLowerCase().includes(q)) ||
                (inv.extractedAmount && ('€' + inv.extractedAmount.toFixed(2)).includes(q)))
            ).slice(0, 15);

            const container = document.getElementById('admin-suggestions');
            if (results.length === 0) {
                container.innerHTML = '<div style="text-align:center;padding:12px;color:var(--muted);font-size:0.82rem">Geen resultaten</div>';
                return;
            }
            container.innerHTML = results.map(inv => adminRenderInvoiceCard(inv, null)).join('');
        }

        function adminSelectInvoice(filename) {
            if (_adminSelectedInvoices.has(filename)) _adminSelectedInvoices.delete(filename);
            else _adminSelectedInvoices.add(filename);
            document.getElementById('admin-btn-link').disabled = _adminSelectedInvoices.size === 0;
            // Re-render suggestions to update radio buttons
            const filtered = adminGetFilteredTxs();
            if (filtered.length > 0) {
                const searchVal = document.getElementById('admin-invoice-search').value;
                if (searchVal && searchVal.length >= 2) {
                    adminSearchInvoices(searchVal);
                } else {
                    adminRenderSuggestions(filtered[_adminCurrentTxIdx]);
                }
            }
        }

        // --- Transaction actions ---
        const ADMIN_CATEGORIES = [
            { id: 'interne_boeking', label: '🔄 Interne boeking', desc: 'Overboeking tussen eigen rekeningen' },
            { id: 'loonbelasting', label: '💼 Loonbelasting', desc: 'Belastingdienst' },
            { id: 'btw_afdracht', label: '🏛️ BTW afdracht', desc: 'Belastingdienst' },
            { id: 'motorrijtuigenbelasting', label: '🚗 Motorrijtuigenbelasting', desc: 'Belastingdienst' },
            { id: 'dividendbelasting', label: '💰 Dividendbelasting', desc: 'Belastingdienst' },
            { id: 'vennootschapsbelasting', label: '🏢 Vennootschapsbelasting', desc: 'Belastingdienst' },
            { id: 'inkomstenbelasting', label: '📊 Inkomstenbelasting', desc: 'Belastingdienst' },
            { id: 'salaris', label: '👤 Salaris', desc: 'Salarisbetaling' },
            { id: 'pin_contant', label: '💳 Pin/Contant', desc: 'Pinbetaling of geldopname' },
            { id: 'abonnement', label: '🔁 Abonnement', desc: 'Vast abonnement' },
            { id: 'prive', label: '🏠 Privé', desc: 'Privé-uitgave/-ontvangst' },
            { id: 'overig', label: '📝 Overig', desc: 'Geen factuur nodig' },
        ];

        function adminShowCategoryPicker() {
            const picker = document.getElementById('admin-category-picker');
            const isVisible = picker.style.display !== 'none';
            picker.style.display = isVisible ? 'none' : '';
            if (isVisible) return;

            // Get current category if set
            const filtered = adminGetFilteredTxs();
            const tx = filtered.length > 0 ? filtered[_adminCurrentTxIdx] : null;
            const currentCat = tx ? tx.category : null;

            const list = document.getElementById('admin-category-list');
            list.innerHTML = ADMIN_CATEGORIES.map(cat =>
                '<button onclick="adminSetCategory(\'' + cat.id + '\')" style="' +
                'padding:8px 12px;border-radius:8px;border:1px solid ' + (currentCat === cat.id ? '#2563eb' : '#e2e8f0') + ';' +
                'background:' + (currentCat === cat.id ? 'var(--app-info-soft)' : 'var(--app-surface)') + ';' +
                'cursor:pointer;font-size:0.8rem;font-weight:500;white-space:nowrap;' +
                'transition:all 0.1s" title="' + cat.desc + '">' +
                cat.label + '</button>'
            ).join('');
        }

        async function adminSetCategory(categoryId) {
            const filtered = adminGetFilteredTxs();
            if (filtered.length === 0) return;
            const tx = filtered[_adminCurrentTxIdx];
            const cat = ADMIN_CATEGORIES.find(c => c.id === categoryId);

            // If was matched, free the invoice
            if (tx.status === 'matched' && tx.invoiceFilename) {
                const inv = _adminInvoicesCache.find(i => i.filename === tx.invoiceFilename);
                if (inv) { inv.linkedToTransaction = null; await adminDB.put('adminInvoices', inv); }
            }

            tx.status = 'no_invoice';
            tx.category = categoryId;
            tx.invoiceFilename = null;
            tx.invoicePath = null;
            await adminDB.put('adminTransactions', tx);

            // Update upload stats
            const allTxs = await adminDB.getAllByIndex('adminTransactions', 'uploadId', _adminCurrentUpload.id);
            const processed = allTxs.filter(t => t.status !== 'open' && t.status !== 'skipped').length;
            _adminCurrentUpload.matchedRows = processed;
            _adminCurrentUpload.status = processed === _adminCurrentUpload.totalRows ? 'completed' : 'in_progress';
            await adminDB.put('adminUploads', _adminCurrentUpload);
            _adminCurrentTxs = allTxs;
            _adminCurrentTxs.sort((a, b) => a.date.localeCompare(b.date));

            document.getElementById('admin-category-picker').style.display = 'none';
            showToast('📁 Gecategoriseerd als ' + (cat ? cat.label : categoryId));

            // Auto-advance
            _adminSelectedInvoices = new Set();
            const newFiltered = adminGetFilteredTxs();
            if (_adminCurrentTxIdx < newFiltered.length - 1) {
                _adminCurrentTxIdx++;
            }
            adminRenderCurrentTx();
        }

        async function adminUnlinkTx() {
            const filtered = adminGetFilteredTxs();
            if (filtered.length === 0) return;
            const tx = filtered[_adminCurrentTxIdx];
            if (tx.status !== 'matched') return;

            // Free all linked invoices back to the pool
            const oldFiles = tx.invoiceFilenames || (tx.invoiceFilename ? [tx.invoiceFilename] : []);
            for (const fn of oldFiles) {
                const inv = _adminInvoicesCache.find(i => i.filename === fn);
                if (inv) { inv.linkedToTransaction = null; await adminDB.put('adminInvoices', inv); }
            }

            // Reset transaction to open
            tx.status = 'open';
            tx.invoiceFilename = null;
            tx.invoiceFilenames = null;
            tx.invoicePath = null;
            tx.invoicePaths = null;
            tx.category = null;
            await adminDB.put('adminTransactions', tx);

            // Update upload stats
            const allTxs = await adminDB.getAllByIndex('adminTransactions', 'uploadId', _adminCurrentUpload.id);
            const processed = allTxs.filter(t => t.status !== 'open' && t.status !== 'skipped').length;
            _adminCurrentUpload.matchedRows = processed;
            _adminCurrentUpload.status = processed === _adminCurrentUpload.totalRows ? 'completed' : 'in_progress';
            await adminDB.put('adminUploads', _adminCurrentUpload);
            _adminCurrentTxs = allTxs;
            _adminCurrentTxs.sort((a, b) => a.date.localeCompare(b.date));

            _adminSelectedInvoices = new Set();
            showToast('🔓 Factuur ontkoppeld');
            adminRenderCurrentTx();
        }

        async function adminTxAction(action) {
            const filtered = adminGetFilteredTxs();
            if (filtered.length === 0) return;
            const tx = filtered[_adminCurrentTxIdx];

            if (action === 'matched' && _adminSelectedInvoices.size === 0) {
                showToast('⚠️ Selecteer eerst een factuur');
                return;
            }

            // Free previously linked invoices if re-linking
            if (tx.status === 'matched') {
                const oldFiles = tx.invoiceFilenames || (tx.invoiceFilename ? [tx.invoiceFilename] : []);
                for (const fn of oldFiles) {
                    const oldInv = _adminInvoicesCache.find(i => i.filename === fn);
                    if (oldInv) { oldInv.linkedToTransaction = null; await adminDB.put('adminInvoices', oldInv); }
                }
            }

            // Update transaction
            tx.status = action;
            if (action === 'matched') {
                const selectedArr = [..._adminSelectedInvoices];
                tx.invoiceFilenames = selectedArr;
                tx.invoiceFilename = selectedArr[0]; // backwards compat
                const firstInv = _adminInvoicesCache.find(i => i.filename === selectedArr[0]);
                tx.invoicePath = firstInv ? firstInv.path : null;
                tx.invoicePaths = selectedArr.map(fn => {
                    const inv = _adminInvoicesCache.find(i => i.filename === fn);
                    return inv ? inv.path : null;
                });
                // Mark all selected invoices as linked
                for (const fn of selectedArr) {
                    const inv = _adminInvoicesCache.find(i => i.filename === fn);
                    if (inv) { inv.linkedToTransaction = tx.id; await adminDB.put('adminInvoices', inv); }
                }
            } else {
                tx.invoiceFilename = null;
                tx.invoiceFilenames = null;
                tx.invoicePath = null;
                tx.invoicePaths = null;
            }
            await adminDB.put('adminTransactions', tx);

            // Update upload stats
            const allTxs = await adminDB.getAllByIndex('adminTransactions', 'uploadId', _adminCurrentUpload.id);
            const processed = allTxs.filter(t => t.status !== 'open' && t.status !== 'skipped').length;
            _adminCurrentUpload.matchedRows = processed;
            _adminCurrentUpload.status = processed === _adminCurrentUpload.totalRows ? 'completed' : 'in_progress';
            await adminDB.put('adminUploads', _adminCurrentUpload);

            // Reload current txs list
            _adminCurrentTxs = allTxs;
            _adminCurrentTxs.sort((a, b) => a.date.localeCompare(b.date));

            showToast(action === 'matched' ? '✅ Factuur gekoppeld' : action === 'no_invoice' ? '📝 Gemarkeerd als geen factuur' : '⏭️ Overgeslagen');

            // Auto-advance to next open
            _adminSelectedInvoices = new Set();
            document.getElementById('admin-invoice-search').value = '';
            const newFiltered = adminGetFilteredTxs();
            if (_adminCurrentTxIdx < newFiltered.length - 1) {
                _adminCurrentTxIdx++;
            }
            adminRenderCurrentTx();
        }

        // --- Auto-match: koppel transacties automatisch ---
        function adminScoreMatch(tx, inv) {
            // Score how well an invoice matches a transaction (higher = better)
            let score = 0;
            const absAmount = Math.abs(tx.amount);
            const isIncoming = tx.amount > 0; // Positive = money received, not a purchase invoice payment
            const fn = inv.filename.toLowerCase();
            const txDesc = (tx.description + ' ' + tx.counterName).toLowerCase();

            // 1. AMOUNT MATCH · strongest signal (but much weaker for incoming amounts)
            const amountWeight = isIncoming ? 0.2 : 1; // Incoming: amount match is weak signal
            // Match on extracted PDF amount
            if (inv.extractedAmount && Math.abs(inv.extractedAmount - absAmount) < 0.02) {
                score += Math.round(100 * amountWeight);
            }
            // Match on any extracted amount
            if (inv.extractedAmounts && inv.extractedAmounts.some(a => Math.abs(a - absAmount) < 0.02)) {
                score += Math.round(80 * amountWeight);
            }
            // Match amount in filename
            const amountStr = absAmount.toFixed(2);
            const amountStrComma = amountStr.replace('.', ',');
            if (fn.includes(amountStr) || fn.includes(amountStrComma)) score += Math.round(70 * amountWeight);
            // Foreign currency match: e.g. tx description "102.79 GBP" matches invoice amount £102.79
            if (inv.extractedAmount && inv.extractedCurrency && inv.extractedCurrency !== 'EUR') {
                const foreignMatch = txDesc.match(/([\d.]+)\s*(?:gbp|usd|eur|chf|sek|dkk|nok|pln|czk)/i);
                if (foreignMatch) {
                    const foreignAmt = parseFloat(foreignMatch[1]);
                    if (!isNaN(foreignAmt) && Math.abs(inv.extractedAmount - foreignAmt) < 0.02) {
                        score += 100; // Strong signal: foreign currency amount matches exactly
                    }
                }
            }

            // 2. INVOICE NUMBER MATCH · very strong signal
            if (inv.extractedInvoiceNr) {
                const invNr = inv.extractedInvoiceNr.toLowerCase();
                if (txDesc.includes(invNr)) score += 90;
                // Also check partial match (numbers only)
                const invNrDigits = invNr.replace(/\D/g, '');
                if (invNrDigits.length >= 4 && txDesc.includes(invNrDigits)) score += 80;
            }
            // Check if invoice number from filename appears in transaction
            const fnNumbers = fn.match(/\d{4,}/g) || [];
            for (const num of fnNumbers) {
                if (txDesc.includes(num)) score += 60;
            }

            // 3. COMPANY NAME MATCH
            if (inv.extractedName) {
                const invName = inv.extractedName.toLowerCase();
                const txName = tx.counterName.toLowerCase();
                // Exact company name match
                if (txName && invName.includes(txName)) score += 40;
                if (txName && txName.includes(invName)) score += 40;
                // Word-level match
                const nameWords = invName.split(/\s+/).filter(w => w.length > 2 && !['b.v.','bv','de','het','van','voor'].includes(w));
                for (const w of nameWords) {
                    if (txName.includes(w)) score += 15;
                }
            }
            // Name match from filename
            const txWords = txDesc.split(/\s+/).filter(w => w.length > 2);
            for (const word of txWords) {
                if (fn.includes(word)) score += 10;
            }

            // 4. IBAN MATCH
            if (inv.extractedIBAN && tx.counterAccount) {
                if (inv.extractedIBAN === tx.counterAccount.replace(/\s/g, '')) score += 60;
            }

            // 5. DATE PROXIMITY · crucial for disambiguating same-amount invoices
            if (tx.date) {
                const txD = new Date(tx.date);
                // Match on extracted date from PDF content
                if (inv.extractedDate) {
                    const invD = new Date(inv.extractedDate);
                    const daysDiff = Math.abs((txD - invD) / 86400000);
                    if (daysDiff <= 3) score += 30;
                    else if (daysDiff <= 14) score += 20;
                    else if (daysDiff <= 45) score += 10;
                    else if (daysDiff <= 90) score += 3;
                }
                // Match date in filename (e.g. bunq_invoice_2026-01-01)
                const fnDateMatch = inv.filename.match(/(\d{4})-(\d{2})-(\d{2})/);
                if (fnDateMatch) {
                    const fnDate = new Date(fnDateMatch[1] + '-' + fnDateMatch[2] + '-' + fnDateMatch[3]);
                    const daysDiff = Math.abs((txD - fnDate) / 86400000);
                    if (daysDiff <= 3) score += 25;
                    else if (daysDiff <= 14) score += 15;
                    else if (daysDiff <= 45) score += 5;
                }
                // Quarter folder match
                const q = 'q' + (Math.floor(txD.getMonth() / 3) + 1) + '-' + txD.getFullYear();
                if (inv.quarterFolder && inv.quarterFolder.toLowerCase().includes(q)) score += 5;
                // File modification date same month
                const invDate = new Date(inv.lastModified);
                if (invDate.getMonth() === txD.getMonth() && invDate.getFullYear() === txD.getFullYear()) score += 3;
            }

            // 6. REFERENCE/ORDER NUMBER MATCH · check numbers from transaction in invoice text
            if (inv.extractedText) {
                const invText = inv.extractedText.toLowerCase();
                // Long numbers (6+ digits) from transaction description · order numbers, reference codes
                const txNumbers = txDesc.match(/\d{6,}/g) || [];
                for (const num of txNumbers) {
                    if (invText.includes(num)) score += 70;
                    if (fn.includes(num)) score += 60;
                }
                // Also check company name words from transaction in invoice text
                const importantWords = txDesc.split(/\s+/).filter(w => w.length > 3 && !/^\d+$/.test(w));
                let textHits = 0;
                for (const w of importantWords) {
                    if (invText.includes(w)) textHits++;
                }
                if (textHits >= 3) score += 15;
                else if (textHits >= 1) score += 5;
            }

            return score;
        }

        async function adminAutoMatch() {
            if (_adminInvoicesCache.length === 0) {
                showToast('⚠️ Scan eerst de facturen-map');
                return;
            }
            showToast('⚡ Auto-koppelen bezig...');
            let matched = 0;
            const openTxs = _adminCurrentTxs.filter(t => t.status === 'open');

            for (const tx of openTxs) {
                // Score all unlinked invoices
                const available = _adminInvoicesCache.filter(inv => !inv.linkedToTransaction);
                const scored = available.map(inv => ({ inv, score: adminScoreMatch(tx, inv) }));
                scored.sort((a, b) => b.score - a.score);

                // Auto-match if top score is high enough AND clearly better than #2
                const best = scored[0];
                const second = scored[1];
                if (best && best.score >= 60) {
                    // Match if: only candidate, or meaningfully ahead of runner-up (10+ pts), or very high score
                    if (!second || second.score < 60 || best.score - second.score >= 10 || best.score >= 150) {
                        const inv = best.inv;
                        tx.status = 'matched';
                        tx.invoiceFilename = inv.filename;
                        tx.invoiceFilenames = [inv.filename];
                        tx.invoicePath = inv.path;
                        tx.invoicePaths = [inv.path];
                        inv.linkedToTransaction = tx.id;
                        await adminDB.put('adminTransactions', tx);
                        await adminDB.put('adminInvoices', inv);
                        matched++;
                    }
                }
            }

            // Update upload stats
            const allTxs = await adminDB.getAllByIndex('adminTransactions', 'uploadId', _adminCurrentUpload.id);
            const processed = allTxs.filter(t => t.status !== 'open' && t.status !== 'skipped').length;
            _adminCurrentUpload.matchedRows = processed;
            _adminCurrentUpload.status = processed === _adminCurrentUpload.totalRows ? 'completed' : 'in_progress';
            await adminDB.put('adminUploads', _adminCurrentUpload);
            _adminCurrentTxs = allTxs;
            _adminCurrentTxs.sort((a, b) => a.date.localeCompare(b.date));

            showToast(matched > 0 ? '⚡ ' + matched + ' transacties automatisch gekoppeld' : 'Geen zekere matches gevonden · handmatig koppelen');
            adminRenderCurrentTx();
        }

        // Auto-match across ALL uploads (runs after scan or import)
        async function adminAutoMatchAll() {
            if (_adminInvoicesCache.length === 0) return;
            const uploads = await adminDB.getAll('adminUploads');
            let totalMatched = 0;
            for (const upload of uploads) {
                const txs = await adminDB.getAllByIndex('adminTransactions', 'uploadId', upload.id);
                const openTxs = txs.filter(t => t.status === 'open');
                let matched = 0;
                for (const tx of openTxs) {
                    const available = _adminInvoicesCache.filter(inv => !inv.linkedToTransaction);
                    const scored = available.map(inv => ({ inv, score: adminScoreMatch(tx, inv) }));
                    scored.sort((a, b) => b.score - a.score);
                    const best = scored[0];
                    const second = scored[1];
                    if (best && best.score >= 60) {
                        if (!second || second.score < 60 || best.score - second.score >= 10 || best.score >= 150) {
                            tx.status = 'matched';
                            tx.invoiceFilename = best.inv.filename;
                            tx.invoiceFilenames = [best.inv.filename];
                            tx.invoicePath = best.inv.path;
                            tx.invoicePaths = [best.inv.path];
                            best.inv.linkedToTransaction = tx.id;
                            await adminDB.put('adminTransactions', tx);
                            await adminDB.put('adminInvoices', best.inv);
                            matched++;
                        }
                    }
                }
                if (matched > 0) {
                    const allTxs = await adminDB.getAllByIndex('adminTransactions', 'uploadId', upload.id);
                    const processed = allTxs.filter(t => t.status !== 'open' && t.status !== 'skipped').length;
                    upload.matchedRows = processed;
                    upload.status = processed === upload.totalRows ? 'completed' : 'in_progress';
                    await adminDB.put('adminUploads', upload);
                    totalMatched += matched;
                }
            }
            if (totalMatched > 0) showToast('⚡ ' + totalMatched + ' transacties automatisch gekoppeld');
        }

        // --- Delete transaction ---
        async function adminDeleteTx() {
            const filtered = adminGetFilteredTxs();
            if (filtered.length === 0) return;
            const tx = filtered[_adminCurrentTxIdx];

            // Remove from IndexedDB
            await adminDB.delete('adminTransactions', tx.id);

            // If it was linked to an invoice, unlink
            if (tx.invoiceFilename) {
                const inv = _adminInvoicesCache.find(i => i.filename === tx.invoiceFilename);
                if (inv) {
                    inv.linkedToTransaction = null;
                    await adminDB.put('adminInvoices', inv);
                }
            }

            // Update upload stats
            const allTxs = await adminDB.getAllByIndex('adminTransactions', 'uploadId', _adminCurrentUpload.id);
            _adminCurrentUpload.totalRows = allTxs.length;
            const processed = allTxs.filter(t => t.status !== 'open' && t.status !== 'skipped').length;
            _adminCurrentUpload.matchedRows = processed;
            if (allTxs.length === 0) {
                _adminCurrentUpload.status = 'completed';
            } else {
                _adminCurrentUpload.status = processed === allTxs.length ? 'completed' : 'in_progress';
            }
            await adminDB.put('adminUploads', _adminCurrentUpload);

            _adminCurrentTxs = allTxs;
            _adminCurrentTxs.sort((a, b) => a.date.localeCompare(b.date));

            showToast('🗑️ Transactie verwijderd');

            _adminSelectedInvoices = new Set();
            if (_adminCurrentTxIdx >= adminGetFilteredTxs().length) {
                _adminCurrentTxIdx = Math.max(0, adminGetFilteredTxs().length - 1);
            }
            adminRenderCurrentTx();
        }

        // --- PDF Preview ---
        async function adminPreviewInvoice(relativePath) {
            if (!_adminFolderHandles.invoices) {
                showToast('⚠️ Kies eerst een facturen-map');
                return;
            }
            try {
                // Navigate to the file through the directory handle
                const parts = relativePath.split('/');
                let handle = _adminFolderHandles.invoices;
                for (let i = 0; i < parts.length - 1; i++) {
                    handle = await handle.getDirectoryHandle(parts[i]);
                }
                const fileHandle = await handle.getFileHandle(parts[parts.length - 1]);
                const file = await fileHandle.getFile();
                const blob = new Blob([await file.arrayBuffer()], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);
                document.getElementById('admin-preview-title').textContent = parts[parts.length - 1];
                document.getElementById('admin-preview-iframe').src = url;
                document.getElementById('admin-preview-modal').classList.add('active');
            } catch (e) {
                showToast('⚠️ Kan factuur niet openen: ' + e.message);
            }
        }

        // --- Export ---
        async function adminExportAll() {
            const uploads = await adminDB.getAll('adminUploads');
            const allTxs = await adminDB.getAll('adminTransactions');
            if (allTxs.length === 0) { showToast('⚠️ Geen transacties om te exporteren'); return; }

            // JSON backup
            const jsonData = {
                exportDate: new Date().toISOString(),
                uploads,
                transactions: allTxs,
                invoices: _adminInvoicesCache
            };

            if (_adminFolderHandles.export) {
                try {
                    const perm = await _adminFolderHandles.export.requestPermission({ mode: 'readwrite' });
                    if (perm !== 'granted') { showToast('⚠️ Geen schrijfrechten'); return; }

                    // Write JSON
                    const jsonHandle = await _adminFolderHandles.export.getFileHandle(
                        'administratie_backup_' + new Date().toISOString().slice(0, 10) + '.json',
                        { create: true }
                    );
                    const jsonWritable = await jsonHandle.createWritable();
                    await jsonWritable.write(JSON.stringify(jsonData, null, 2));
                    await jsonWritable.close();

                    // Write CSV
                    const csvRows = [['Datum', 'Bedrag', 'Tegenpartij', 'Omschrijving', 'Status', 'Categorie', 'Factuur', 'Factuurpad']];
                    for (const tx of allTxs) {
                        const fnames = tx.invoiceFilenames || (tx.invoiceFilename ? [tx.invoiceFilename] : []);
                        const fpaths = tx.invoicePaths || (tx.invoicePath ? [tx.invoicePath] : []);
                        const cat = tx.category ? (ADMIN_CATEGORIES.find(c => c.id === tx.category) || {}).label || tx.category : '';
                        csvRows.push([
                            tx.date,
                            tx.amount.toFixed(2).replace('.', ','),
                            tx.counterName,
                            tx.description.replace(/"/g, '""'),
                            tx.status,
                            cat,
                            fnames.join(' | '),
                            fpaths.join(' | ')
                        ]);
                    }
                    const csvContent = csvRows.map(r => r.map(c => '"' + c + '"').join(';')).join('\r\n');
                    const csvHandle = await _adminFolderHandles.export.getFileHandle(
                        'administratie_export_' + new Date().toISOString().slice(0, 10) + '.csv',
                        { create: true }
                    );
                    const csvWritable = await csvHandle.createWritable();
                    await csvWritable.write(new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' }));
                    await csvWritable.close();

                    // Write HTML overview
                    const invoiceBasePath = await adminGetInvoiceBasePath();
                    const htmlContent = adminBuildHtmlExport(uploads, allTxs, invoiceBasePath);
                    const htmlHandle = await _adminFolderHandles.export.getFileHandle(
                        'administratie_overzicht_' + new Date().toISOString().slice(0, 10) + '.html',
                        { create: true }
                    );
                    const htmlWritable = await htmlHandle.createWritable();
                    await htmlWritable.write(new Blob([htmlContent], { type: 'text/html;charset=utf-8' }));
                    await htmlWritable.close();

                    showToast('✓ Export opgeslagen in map (CSV + HTML + JSON)');
                } catch (e) {
                    showToast('⚠️ Export mislukt: ' + e.message);
                }
            } else {
                // Fallback: download
                const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'administratie_backup_' + new Date().toISOString().slice(0, 10) + '.json';
                a.click();
                URL.revokeObjectURL(url);
                showToast('✓ JSON backup gedownload');
            }
        }

        function adminBuildHtmlExport(uploads, allTxs, invoiceBasePath) {
            const today = new Date().toLocaleDateString('nl-NL', { day: '2-digit', month: 'long', year: 'numeric' });
            // Group transactions by upload
            const byUpload = {};
            for (const tx of allTxs) {
                if (!byUpload[tx.uploadId]) byUpload[tx.uploadId] = [];
                byUpload[tx.uploadId].push(tx);
            }
            // Sort each group by date
            for (const uid in byUpload) byUpload[uid].sort((a, b) => a.date.localeCompare(b.date));

            const statusLabel = { matched: 'Gekoppeld', open: 'Open', no_invoice: 'Geen factuur', skipped: 'Overgeslagen' };
            const statusColor = { matched: '#dcfce7', open: '#fef9c3', no_invoice: '#f1f5f9', skipped: '#f1f5f9' };
            const statusBorder = { matched: '#22c55e', open: '#eab308', no_invoice: '#94a3b8', skipped: '#d4d4d8' };

            let sections = '';
            for (const upload of uploads.sort((a, b) => (a.periodLabel || '').localeCompare(b.periodLabel || ''))) {
                const txs = byUpload[upload.id] || [];
                if (txs.length === 0) continue;
                const matched = txs.filter(t => t.status === 'matched').length;
                const total = txs.length;

                let rows = '';
                for (const tx of txs) {
                    const d = tx.date.split('-');
                    const dateStr = d[2] + '-' + d[1] + '-' + d[0];
                    const amt = (tx.amount < 0 ? '-' : '+') + '€\u00A0' + Math.abs(tx.amount).toLocaleString('nl-NL', { minimumFractionDigits: 2 });
                    const amtColor = tx.amount < 0 ? '#dc2626' : '#16a34a';
                    const bg = statusColor[tx.status] || '#fff';
                    const border = statusBorder[tx.status] || '#e5e7eb';
                    const name = tx.counterName || tx.description.slice(0, 40);

                    let invoiceCell = '';
                    if (tx.status === 'matched') {
                        const fnames = tx.invoiceFilenames || (tx.invoiceFilename ? [tx.invoiceFilename] : []);
                        const fpaths = tx.invoicePaths || (tx.invoicePath ? [tx.invoicePath] : []);
                        invoiceCell = fnames.map((fn, i) => {
                            const relPath = (fpaths[i] && fpaths[i] !== 'null') ? fpaths[i] : fn;
                            const baseFwd = (invoiceBasePath || '').replace(/\\/g, '/').replace(/\/+$/, '');
                            const relFwd = relPath.replace(/\\/g, '/');
                            const fullPath = baseFwd ? baseFwd + '/' + relFwd : relFwd;
                            const fileUrl = 'file:///' + fullPath.split('/').map(p => encodeURIComponent(p)).join('/');
                            return '<a href="' + fileUrl + '" style="color:#2563eb;font-size:0.8rem;display:block;text-decoration:none" target="_blank">📄 ' + fn.replace(/</g, '&lt;') + '</a>';
                        }).join('');
                    } else {
                        const cat = tx.category ? ADMIN_CATEGORIES.find(c => c.id === tx.category) : null;
                        invoiceCell = '<span style="font-size:0.75rem;color:#9ca3af">' + (cat ? cat.label : (statusLabel[tx.status] || '')) + '</span>';
                    }

                    rows += '<tr style="border-left:4px solid ' + border + ';background:' + bg + '">' +
                        '<td style="padding:8px 10px;font-size:0.82rem;white-space:nowrap">' + dateStr + '</td>' +
                        '<td style="padding:8px 10px;font-weight:600;font-size:0.85rem;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + name.replace(/</g, '&lt;') + '</td>' +
                        '<td style="padding:8px 10px;text-align:right;font-weight:700;color:' + amtColor + ';white-space:nowrap;font-size:0.85rem">' + amt + '</td>' +
                        '<td style="padding:8px 10px">' + invoiceCell + '</td>' +
                        '</tr>\n';
                }

                sections += '<div style="margin-bottom:32px">' +
                    '<h2 style="font-size:1rem;font-weight:700;margin:0 0 4px 0;color:#1e3a5f">' + (upload.periodLabel || upload.filename).replace(/</g, '&lt;') + '</h2>' +
                    '<div style="font-size:0.8rem;color:#6b7280;margin-bottom:10px">' + matched + ' / ' + total + ' gekoppeld · ' + (upload.filename || '').replace(/</g, '&lt;') + '</div>' +
                    '<table style="width:100%;border-collapse:collapse;border-spacing:0">' +
                    '<thead><tr style="background:#f1f5f9;border-bottom:2px solid #e2e8f0">' +
                    '<th style="padding:6px 10px;text-align:left;font-size:0.75rem;font-weight:600;color:#64748b">Datum</th>' +
                    '<th style="padding:6px 10px;text-align:left;font-size:0.75rem;font-weight:600;color:#64748b">Tegenpartij</th>' +
                    '<th style="padding:6px 10px;text-align:right;font-size:0.75rem;font-weight:600;color:#64748b">Bedrag</th>' +
                    '<th style="padding:6px 10px;text-align:left;font-size:0.75rem;font-weight:600;color:#64748b">Factuur</th>' +
                    '</tr></thead><tbody>\n' + rows + '</tbody></table></div>\n';
            }

            // Summary stats
            const totalTxs = allTxs.length;
            const totalMatched = allTxs.filter(t => t.status === 'matched').length;
            const totalNoInv = allTxs.filter(t => t.status === 'no_invoice').length;
            const totalOpen = allTxs.filter(t => t.status === 'open').length;
            const totalSkipped = allTxs.filter(t => t.status === 'skipped').length;

            return '<!DOCTYPE html>\n<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
                '<title>Administratie Overzicht ·' + today + '</title>' +
                '<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;margin:0;padding:20px 24px;background:#f8fafc;color:var(--app-ink-900)}' +
                'a:hover{text-decoration:underline!important}' +
                'table{box-shadow:0 1px 3px rgba(0,0,0,0.08);border-radius:8px;overflow:hidden}' +
                'tr:hover td{filter:brightness(0.97)}' +
                '@media print{body{padding:10px}table{box-shadow:none}a{color:#000!important}}' +
                '@media(max-width:600px){td,th{padding:6px 6px!important;font-size:0.75rem!important}}</style></head><body>' +
                '<div style="max-width:900px;margin:0 auto">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;border-bottom:2px solid #1e3a5f;padding-bottom:12px">' +
                '<div><h1 style="font-size:1.3rem;font-weight:700;margin:0;color:#1e3a5f">📋 Administratie Overzicht</h1>' +
                '<div style="font-size:0.8rem;color:#6b7280;margin-top:2px">Kuijpers Technical Services · ' + today + '</div></div>' +
                '<div style="display:flex;gap:12px;font-size:0.8rem;font-weight:600">' +
                '<span style="color:#22c55e">✅ ' + totalMatched + '</span>' +
                '<span style="color:#eab308">⏳ ' + totalOpen + '</span>' +
                '<span style="color:#94a3b8">📝 ' + totalNoInv + '</span>' +
                (totalSkipped > 0 ? '<span style="color:#d4d4d8">⏭️ ' + totalSkipped + '</span>' : '') +
                '<span style="color:#1e3a5f">' + totalTxs + ' totaal</span></div></div>' +
                sections +
                '<div style="text-align:center;font-size:0.72rem;color:#9ca3af;margin-top:32px;padding-top:12px;border-top:1px solid #e2e8f0">' +
                'Gegenereerd vanuit KTS Uren App · Facturen-map: ' + (invoiceBasePath || '(niet ingesteld)').replace(/</g, '&lt;') + '</div>' +
                '</div></body></html>';
        }

        // --- JSON Import ---
        function adminImportJson() {
            document.getElementById('admin-json-import-input').click();
        }

        async function adminHandleJsonImport(input) {
            const file = input.files[0];
            if (!file) return;
            input.value = '';
            try {
                const text = await file.text();
                const data = JSON.parse(text);
                if (!data.uploads || !data.transactions) { showToast('⚠️ Ongeldig JSON-bestand'); return; }

                // Import uploads
                for (const u of data.uploads) await adminDB.put('adminUploads', u);
                // Import transactions
                for (const t of data.transactions) await adminDB.put('adminTransactions', t);
                // Import invoices if present
                if (data.invoices) {
                    for (const inv of data.invoices) await adminDB.put('adminInvoices', inv);
                    _adminInvoicesCache = await adminDB.getAll('adminInvoices');
                }

                showToast('✓ ' + data.transactions.length + ' transacties geïmporteerd');
                adminRenderUploads();
            } catch (e) {
                showToast('⚠️ Import mislukt: ' + e.message);
            }
        }

        // =========================================================
        // ===== EINDE ADMINISTRATIE MODULE ========================
        // =========================================================

        // ===== PWA SERVICE WORKER =====
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js').then(() => {
                console.log('Service Worker geregistreerd');
            }).catch(err => console.warn('SW registratie mislukt:', err));
        }

        // ===== LOGIN-OVERLAY SCROLL LOCK =====
        // Houdt html.login-active class gesynchroniseerd met overlay-zichtbaarheid.
        // Voorkomt dat app-content kort doorscrollt op iOS/Android tijdens login.
        (function() {
            function syncLoginLock() {
                const ov = document.getElementById('login-overlay');
                if (!ov) return;
                const isVisible = ov.style.display !== 'none' && getComputedStyle(ov).display !== 'none';
                document.documentElement.classList.toggle('login-active', isVisible);
            }
            // Initial sync na page load
            syncLoginLock();
            // Observe style/class changes op de overlay · vangt alle 5 toggle-call-sites
            const ov = document.getElementById('login-overlay');
            if (ov) {
                const observer = new MutationObserver(syncLoginLock);
                observer.observe(ov, { attributes: true, attributeFilter: ['style', 'class'] });
            }
        })();
