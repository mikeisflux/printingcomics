with open('/Users/maurapowers/Desktop/philbo-portal/src/pages/RetailerPortal.jsx', 'r') as f:
    js = f.read()
    
clean_code = []
state = 'code'
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
        if stack:
            top, l_num, c_idx = stack.pop()
            if line_num >= 850:
                print(f"Popped '{top}' (opened at line {l_num}) because of '{char}' at line {line_num}")
        else:
            if line_num >= 850:
                print(f"Extra closing '{char}' at line {line_num}")
                
print(f"Final stack size: {len(stack)}")
for item in stack:
    print(f"Unclosed '{item[0]}' opened at line {item[1]}")
