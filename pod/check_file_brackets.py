import os

def check_brackets_for_file(filepath):
    with open(filepath, 'r') as f:
        js = f.read()
        
    clean_code = []
    state = 'code' # 'code', 'single_comment', 'multi_comment', 'single_str', 'double_str', 'backtick_str', 'regex'
    escape = False
    
    i = 0
    n = len(js)
    
    line_nums = []
    current_line = 1
    
    while i < n:
        char = js[i]
        if char == '\n':
            current_line += 1
        next_char = js[i+1] if i + 1 < n else ''
        
        if state == 'code':
            if char == '/' and next_char == '/':
                state = 'single_comment'
                i += 1
            elif char == '/' and next_char == '*':
                state = 'multi_comment'
                i += 1
            elif char == "'":
                state = 'single_str'
            elif char == '"':
                state = 'double_str'
            elif char == '`':
                state = 'backtick_str'
            elif char == '/' and i > 0 and js[i-1] in '=(,;:!&|[]{}':
                state = 'regex'
            else:
                clean_code.append(char)
                line_nums.append(current_line)
        elif state == 'single_comment':
            if char == '\n':
                state = 'code'
                clean_code.append('\n')
                line_nums.append(current_line)
        elif state == 'multi_comment':
            if char == '*' and next_char == '/':
                state = 'code'
                i += 1
        elif state == 'single_str':
            if escape:
                escape = False
            elif char == '\\':
                escape = True
            elif char == "'":
                state = 'code'
        elif state == 'double_str':
            if escape:
                escape = False
            elif char == '\\':
                escape = True
            elif char == '"':
                state = 'code'
        elif state == 'backtick_str':
            if escape:
                escape = False
            elif char == '\\':
                escape = True
            elif char == '`':
                state = 'code'
        elif state == 'regex':
            if escape:
                escape = False
            elif char == '\\':
                escape = True
            elif char == '/':
                state = 'code'
                
        i += 1
        
    stack = []
    for idx, char in enumerate(clean_code):
        line_num = line_nums[idx]
        if char in '({[':
            stack.append((char, line_num, idx))
        elif char in ')}]':
            if not stack:
                return f"Extra closing character '{char}' at line {line_num}"
            top, l_num, c_idx = stack.pop()
            if (char == ')' and top != '(') or (char == '}' and top != '{') or (char == ']' and top != '['):
                return f"Mismatch: opened '{top}' at line {l_num} and closed with '{char}' at line {line_num}"
                
    if stack:
        res = f"Unclosed braces/brackets left: {len(stack)}\n"
        for item in stack[:5]:
            res += f"Unclosed '{item[0]}' opened at line {item[1]}\n"
        return res
    return "Balanced!"

def check_all():
    src_dir = '/Users/maurapowers/Desktop/philbo-portal/src'
    files = [
        'firebase-mock.js',
        'pages/Home.jsx',
        'pages/Services.jsx',
        'pages/PublisherGuide.jsx',
        'pages/Apply.jsx',
        'pages/Login.jsx',
        'pages/PublisherPortal.jsx',
        'pages/RetailerPortal.jsx',
        'pages/AdminPortal.jsx',
        'App.jsx'
    ]
    for rel_path in files:
        full_path = os.path.join(src_dir, rel_path)
        print(f"Checking {rel_path}...")
        print(check_brackets_for_file(full_path))
        print("-" * 50)

if __name__ == '__main__':
    check_all()
