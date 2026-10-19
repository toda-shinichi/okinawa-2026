# OKINAWA 2026 v3 改版腳本：自動修改 index.html
# 用法：在專案根目錄執行  python3 upgrade_kit/upgrade_v3.py
# 前提：已先執行過 upgrade_kit/split_data.py
# 安全機制：每一個修改點都會檢查「剛好出現一次」，任何一點對不上就整個停止，index.html 完全不會被改動。

import re
import sys

SRC = 'index.html'
html = open(SRC, encoding='utf-8').read()
original = html
log = []


def fail(msg):
    sys.exit('[停止] ' + msg + '\nindex.html 沒有被修改。請把這段訊息回報給子桓。')


def replace_once(old, new, label):
    global html
    n = html.count(old)
    if n != 1:
        fail(label + '：預期找到 1 處，實際找到 ' + str(n) + ' 處')
    html = html.replace(old, new, 1)
    log.append('完成：' + label)


def remove_function(name):
    """刪除主程式中 4 格縮排的 function NAME(...) { ... } 整段。"""
    global html
    start_token = '\n    function ' + name + '('
    n = html.count(start_token)
    if n != 1:
        fail('刪除函式 ' + name + '：預期 1 處，實際 ' + str(n) + ' 處')
    start = html.index(start_token)
    end = html.index('\n    }\n', start) + len('\n    }')
    html = html[:start] + html[end:]
    log.append('刪除函式：' + name)


def remove_block(start_token, end_token, label):
    global html
    if html.count(start_token) != 1:
        fail(label + '：找不到唯一的開頭')
    start = html.index(start_token)
    end = html.index(end_token, start) + len(end_token)
    html = html[:start] + html[end:]
    log.append('刪除區塊：' + label)


if 'js/app.js' in html:
    fail('偵測到 index.html 已經改版過（已引用 js/app.js），不可重複執行')
if './data/places.js' not in html:
    fail('請先執行 upgrade_kit/split_data.py')

# ---------- 0. 個資：從公開網頁移除身分證字號、護照號碼、出生日期 ----------
replace_once(
    '<div><span class="text-stone-400 font-sans block text-xs">護照號碼 (Passport No.)</span><b>361537836</b></div>',
    '<div><span class="text-stone-400 font-sans block text-xs">護照號碼 (Passport No.)</span><b>末四碼 7836（完整號碼見護照正本）</b></div>',
    '遮蔽護照號碼')
replace_once(
    '<div><span class="text-stone-400 font-sans block text-xs">身分證字號 / 出生日期</span><b>A128378959 (1993/06/15)</b></div>',
    '<div><span class="text-stone-400 font-sans block text-xs">身分證字號 / 出生日期</span><b>不公開顯示（請備妥身分證影本）</b></div>',
    '移除身分證字號與出生日期')

# ---------- 1. <head>：固定 Tailwind 版本、PWA 設定 ----------
replace_once(
    '  <script src="https://cdn.tailwindcss.com"></script>\n',
    '  <meta name="theme-color" content="#1E3A5F">\n'
    '  <link rel="manifest" href="./manifest.webmanifest">\n'
    '  <link rel="apple-touch-icon" href="./icons/apple-touch-icon.png">\n'
    '  <link rel="icon" type="image/png" href="./icons/icon-192.png">\n'
    '  <script src="https://cdn.tailwindcss.com/3.4.17"></script>\n',
    'head：固定 Tailwind 3.4.17 並加入 manifest')

CSS = open('upgrade_kit/v3.css', encoding='utf-8').read()
replace_once('  </style>\n</head>', CSS.rstrip('\n') + '\n  </style>\n</head>', 'head：加入 v3 樣式')

# ---------- 2. 頂部：同步燈號與設定按鈕 ----------
replace_once(
    '    <!-- 快速資訊副欄 -->\n',
    '    <!-- 同步狀態列 -->\n'
    '    <div class="max-w-3xl mx-auto px-4 pb-2 flex items-center justify-between gap-2">\n'
    '      <span id="sync-chip" class="text-xs font-bold px-2.5 py-1.5 rounded bg-white/15 text-slate-200">僅存本機</span>\n'
    '      <button onclick="openSettings()" class="bg-white/15 text-white text-xs sm:text-sm font-bold px-3.5 py-1.5 rounded">設定與同步</button>\n'
    '    </div>\n'
    '    <!-- 快速資訊副欄 -->\n',
    '頂部：同步燈號與設定按鈕')

# ---------- 3. 行程頁：天氣列、自駕工具卡、時間輸入 ----------
replace_once(
    '      <div id="day-transport-banner"',
    '      <div id="weather-strip" class="bg-white border border-stone-200 rounded-xl p-3.5 text-sm text-stone-700"></div>\n'
    '      <div id="drive-card" class="hidden bg-white border-2 border-ryukyu-indigo rounded-xl p-4 space-y-2.5"></div>\n\n'
    '      <div id="day-transport-banner"',
    '行程頁：天氣列與自駕工具卡')
replace_once(
    '<input type="text" id="new-item-time" placeholder="時間 (例 15:30)" class="border border-stone-300 rounded-lg px-3 py-2 text-xs font-mono">',
    '<input type="time" id="new-item-time" value="12:00" class="border border-stone-300 rounded-lg px-3 py-2 text-sm font-mono">',
    '行程頁：時間欄位改成時間選擇器')

# ---------- 4. 底部導覽列：移除保單急救（頂部已有按鈕），6 欄改 5 欄 ----------
replace_once('<div class="max-w-3xl mx-auto grid grid-cols-6 text-center">',
             '<div class="max-w-3xl mx-auto grid grid-cols-5 text-center">', '導覽列：改 5 欄')
remove_block('      <button onclick="switchTab(\'sos\')" id="nav-sos"', '      </button>\n', '導覽列：移除保單急救按鈕')

# ---------- 5. 分帳頁 ----------
replace_once(
    '        <!-- 快速換算器 -->\n',
    '        <p id="fx-status" class="text-xs text-stone-500 text-right -mt-2"></p>\n\n'
    '        <!-- 快速換算器 -->\n',
    '分帳頁：匯率狀態文字')
replace_once(
    '        <h3 class="text-sm font-bold text-stone-900">記一筆開銷</h3>\n',
    '        <h3 class="text-sm font-bold text-stone-900">記一筆開銷</h3>\n'
    '        <input type="hidden" id="exp-edit-id" value="">\n',
    '分帳頁：編輯用隱藏欄位')
replace_once(
    '<h3 class="text-sm font-bold text-stone-900">記一筆開銷</h3>',
    '<h3 class="text-sm font-bold text-stone-900" id="exp-form-card">記一筆開銷</h3>',
    '分帳頁：表單錨點')
replace_once(
    '          <div id="exp-splitters" class="flex flex-wrap gap-2 pt-1"></div>\n        </div>\n',
    '          <div id="exp-splitters" class="flex flex-wrap gap-2 pt-1"></div>\n        </div>\n\n'
    '        <div>\n'
    '          <label class="text-xs sm:text-sm font-medium text-stone-600 block mb-1">分類</label>\n'
    '          <select id="exp-category" class="w-full border border-stone-300 rounded-lg px-2.5 py-2 text-sm bg-white"></select>\n'
    '        </div>\n',
    '分帳頁：分類欄位')
replace_once(
    '<button onclick="addExpense()" class="w-full bg-ryukyu-terracotta text-white text-xs font-bold py-2.5 rounded-lg shadow-sm hover:opacity-95 transition">儲存這筆帳目</button>',
    '<button onclick="addExpense()" id="exp-submit-btn" class="w-full bg-ryukyu-terracotta text-white text-sm font-bold py-3 rounded-lg shadow-sm hover:opacity-95 transition">儲存這筆帳目</button>\n'
    '        <button onclick="cancelEditExpense()" id="exp-cancel-btn" class="hidden w-full border border-stone-300 text-stone-700 text-sm font-bold py-3 rounded-lg">取消編輯</button>',
    '分帳頁：儲存與取消編輯按鈕')
replace_once(
    '<div id="settlement-list" class="space-y-2 text-xs"></div>\n',
    '<div id="settlement-list" class="space-y-2 text-xs"></div>\n'
    '        <button onclick="shareSettlement()" class="w-full bg-white/15 hover:bg-white/25 text-white text-sm font-bold py-3 rounded-lg">把結算結果傳到 LINE</button>\n',
    '分帳頁：結算分享按鈕')
replace_once(
    '<div id="expense-list" class="divide-y divide-stone-100 text-xs"></div>\n      </div>\n',
    '<div id="expense-list" class="divide-y divide-stone-100 text-xs"></div>\n      </div>\n\n'
    '      <!-- 開銷統計 -->\n'
    '      <div id="expense-stats" class="bg-white rounded-xl p-4 shadow-sm border border-stone-200 space-y-2"></div>\n',
    '分帳頁：統計區塊')

# ---------- 6. 對話框與提示訊息容器 ----------
replace_once(
    '\n  <script src="./data/places.js"></script>\n',
    '\n  <!-- v3 對話框 -->\n'
    '  <div id="app-dialog" class="hidden fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center p-4">\n'
    '    <div class="dlg-panel w-full max-w-md rounded-2xl p-5 space-y-3 max-h-[85vh] overflow-y-auto">\n'
    '      <h3 id="app-dialog-title" class="text-lg font-bold"></h3>\n'
    '      <div id="app-dialog-body"></div>\n'
    '      <div id="app-dialog-actions" class="flex justify-end gap-2 pt-2"></div>\n'
    '    </div>\n'
    '  </div>\n'
    '  <!-- v3 提示訊息 -->\n'
    '  <div id="toast-box" class="fixed left-0 right-0 bottom-24 z-[70] flex flex-col items-center gap-2 px-4 pointer-events-none"></div>\n\n'
    '  <script src="./js/sync.js"></script>\n'
    '  <script src="./js/model.js"></script>\n'
    '  <script src="./data/places.js"></script>\n',
    '對話框容器與 sync.js、model.js 引用')

# ---------- 7. 主程式：刪除被 app.js 取代的舊程式 ----------
replace_once("    const STORAGE_KEY = 'okinawa_2026_tzh_v2';\n", '', '刪除舊 STORAGE_KEY')
remove_block('    let state = {\n', '\n    };\n', '刪除舊 state 物件')
for fn in ['loadState', 'saveState', 'switchTab',
           'getActiveItineraryForDay', 'selectDay', 'selectSatRoute', 'renderItinerary',
           'addCustomItineraryItem', 'removeItineraryItem', 'resetDefaultItinerary', 'sendPlaceToItinerary',
           'updateFxRate', 'addMember', 'removeMember', 'addExpense', 'deleteExpense',
           'renderSplitSection', 'exportExpensesText',
           'addTastingNote', 'deleteTastingNote', 'renderTastingNotes', 'initApp']:
    remove_function(fn)
remove_block("    if (document.readyState === 'loading') {\n", '\n    }\n', '刪除舊啟動程式')

# ---------- 8. 主程式：其餘程式改用 prefs、toast，修正跳脫 ----------
main_start = html.index('    // ==================== 1.')
main_end = html.index('</script>', main_start)
main = html[main_start:main_end]
leftover = re.findall(r'state\.(\w+)', main)
allowed = {'favorites', 'sourceFilter', 'regionFilter', 'tagFilter', 'fxRate', 'taxBasket',
           'checkedClaims', 'customFlashcards', 'currentDay'}
unknown = sorted(set(leftover) - allowed)
if unknown:
    fail('主程式還有未預期的 state 欄位：' + ', '.join(unknown))
main = re.sub(r'\bstate\.', 'prefs.', main)
main = main.replace('saveState()', 'savePrefs()')
main = re.sub(r'\balert\(', 'toast(', main)
main = main.replace("'符合條件共 ' + filtered.length + ' 個地點（總庫 199 點）'",
                    "'符合條件共 ' + filtered.length + ' 個地點（總庫 ' + RAW_PLACES.length + ' 點）'")
# escStr 加強：雙引號與 < 也要跳脫，避免破壞 HTML 屬性
old_esc = "return String(s || '').replace(/\\\\/g, '\\\\\\\\').replace(/'/g, \"\\\\'\").replace(/\\r?\\n/g, ' ');"
if main.count(old_esc) != 1:
    fail('escStr 內容與預期不同')
main = main.replace(old_esc, "return String(s || '').replace(/\\\\/g, '\\\\\\\\').replace(/'/g, \"\\\\'\").replace(/\"/g, '\\\\x22').replace(/</g, '\\\\x3C').replace(/\\r?\\n/g, ' ');")
# 自訂字卡的文字要跳脫
for field in ['c.cat', 'c.type', 'c.zh', 'c.jp', 'c.kana', 'c.roma', 'c.pron', 'c.note']:
    main = main.replace('>${' + field + '}<', '>${escapeHtml(' + field + ')}<')
    main = main.replace('<b>${' + field + '}</b>', '<b>${escapeHtml(' + field + ')}</b>')
html = html[:main_start] + main + html[main_end:]
log.append('主程式：state 改 prefs、alert 改 toast、escStr 加強、字卡跳脫、總庫數字動態化')

# ---------- 9. 其他寫死的「199」 ----------
replace_once('placeholder="搜尋 199 個地點名稱', 'placeholder="搜尋地點名稱', '搜尋框文字')
replace_once('>全部 (199)</button>', '>全部</button>', '來源篩選按鈕文字')
replace_once('<span id="places-count-label">顯示 199 個地點</span>', '<span id="places-count-label"></span>', '地點數量文字')

replace_once('<span>10月下旬日落約 <b>17:48</b></span>', '<span>日落約 <b>17:50</b>（以天氣列為準）</span>', '頂部日落時間文字')

# ---------- 10. 在主程式之後載入 app.js ----------
replace_once('  </script>\n</body>', '  </script>\n  <script src="./js/app.js"></script>\n</body>', '載入 app.js')

open(SRC, 'w', encoding='utf-8').write(html)
print('\n'.join(log))
print('\n全部完成，共 ' + str(len(log)) + ' 項。index.html 由 ' + str(len(original)) + ' 字元變為 ' + str(len(html)) + ' 字元。')
