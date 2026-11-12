def check_js_syntax(filepath):
    with open(filepath, 'r') as f:
        html = f.read()
        
    start_tag = '<script type="text/babel">'
    end_tag = '</script>'
    
    start_idx = html.find(start_tag)
    end_idx = html.find(end_tag, start_idx)
    
    if start_idx == -1 or end_idx == -1:
        print("Script tag not found")
        return
        
    js = html[start_idx + len(start_tag):end_idx]
    
    # State machine to strip comments, strings, and regexes
    clean_code = []
    state = 'code' # 'code', 'single_comment', 'multi_comment', 'single_str', 'double_str', 'backtick_str', 'regex'
    escape = False
    
    i = 0
    n = len(js)
    
    line_nums = []
    current_line = 1
    
    while i < n:
        char = js[i]
        
        # Track line numbers
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
            elif char == '/' and i > 0 and js[i-1] in '=(,;:!&|[]{}': # Rough regex start detection
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
        
    # Check brackets on the cleaned code
    stack = []
    for idx, char in enumerate(clean_code):
        line_num = line_nums[idx]
        if char in '({[':
            stack.append((char, line_num, idx))
        elif char in ')}]':
            if not stack:
                print(f"Extra closing character '{char}' at line {line_num}:")
                # print surrounding clean code
                start_print = max(0, idx - 40)
                end_print = min(len(clean_code), idx + 40)
                context = "".join(clean_code[start_print:end_print])
                print("Context:", repr(context))
                return
            top, l_num, c_idx = stack.pop()
            if (char == ')' and top != '(') or (char == '}' and top != '{') or (char == ']' and top != '['):
                print(f"Mismatch: opened '{top}' at line {l_num} and closed with '{char}' at line {line_num}:")
                # print open context
                start_print = max(0, c_idx - 40)
                end_print = min(len(clean_code), c_idx + 40)
                print("Open context:", repr("".join(clean_code[start_print:end_print])))
                # print close context
                start_print = max(0, idx - 40)
                end_print = min(len(clean_code), idx + 40)
                print("Close context:", repr("".join(clean_code[start_print:end_print])))
                return
                
    if stack:
        print(f"Unclosed braces/brackets left: {len(stack)}")
        for item in stack[:5]:
            print(f"Unclosed '{item[0]}' opened at line {item[1]}")
    else:
        print("Babel script is perfectly balanced!")

if __name__ == '__main__':
    check_js_syntax('/Users/maurapowers/Desktop/philbo-portal/philbo-operations-hub.html')
