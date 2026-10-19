# 把 index.html 內的大型資料常數搬到 data/ 資料夾。用法：在專案根目錄執行 python3 split_data.py
# 只能執行一次；第二次執行會因為找不到常數而停止，不會破壞檔案。
import os, re, sys

SRC = 'index.html'
html = open(SRC, encoding='utf-8').read()
lines = html.split('\n')

def take_single_line(prefix):
    for i, line in enumerate(lines):
        if line.startswith(prefix) and line.rstrip().endswith('];'):
            return i, i
    sys.exit('找不到單行常數：' + prefix + '（可能已經拆過了）')

def take_block(prefix):
    for i, line in enumerate(lines):
        if line.startswith(prefix):
            for j in range(i + 1, len(lines)):
                if lines[j] == '    ];':
                    return i, j
    sys.exit('找不到多行常數：' + prefix + '（可能已經拆過了）')

targets = [
    ('data/places.js', take_single_line('    const RAW_PLACES = [')),
    ('data/culture.js', take_block('    const CULTURE_CHAPTERS = [')),
    ('data/flashcards.js', take_single_line('    const DEFAULT_FLASHCARDS = [')),
]

os.makedirs('data', exist_ok=True)
for path, (a, b) in targets:
    body = '\n'.join(l[4:] if l.startswith('    ') else l for l in lines[a:b + 1])
    with open(path, 'w', encoding='utf-8') as f:
        f.write('// 由 split_data.py 從 index.html 拆出，請直接編輯本檔\n' + body + '\n')
    print('已寫出', path, '（原第', a + 1, '到', b + 1, '行）')

# 由後往前刪，行號才不會跑掉
for a, b in sorted((t[1] for t in targets), reverse=True):
    del lines[a:b + 1]

out = '\n'.join(lines)
marker = '  <script>\n    // ==================== 1.'
if marker not in out:
    sys.exit('找不到主程式 <script> 的位置，已停止，index.html 未修改')
tags = ('  <script src="./data/places.js"></script>\n'
        '  <script src="./data/culture.js"></script>\n'
        '  <script src="./data/flashcards.js"></script>\n')
out = out.replace(marker, tags + marker, 1)
open(SRC, 'w', encoding='utf-8').write(out)
print('index.html 已更新')
