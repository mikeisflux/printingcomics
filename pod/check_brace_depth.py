with open('/Users/maurapowers/Desktop/philbo-portal/src/pages/RetailerPortal.jsx', 'r') as f:
    js = f.read()
    
state = 'code'
escape = False

i = 0
n = len(js)

current_line = 1
depth = 0

while i < n:
    char = js[i]
    if char == '\n':
        current_line += 1
        if current_line == 224:
            print(f"Brace depth at line 224: {depth}")
            
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
            if char == '{':
                depth += 1
            elif char == '}':
                depth -= 1
    elif state == 'single_comment':
        if char == '\n':
            state = 'code'
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
