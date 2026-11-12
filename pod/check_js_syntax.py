def check_brackets():
    with open('/Users/maurapowers/Desktop/philbo-portal/philbo-operations-hub.html', 'r') as f:
        html = f.read()
        
    start_tag = '<script type="text/babel">'
    end_tag = '</script>'
    
    start_idx = html.find(start_tag)
    end_idx = html.find(end_tag, start_idx)
    
    if start_idx == -1 or end_idx == -1:
        print("Script tag not found")
        return
        
    js = html[start_idx + len(start_tag):end_idx]
    
    stack = []
    lines = js.splitlines()
    
    for line_num, line in enumerate(lines, start=1):
        # Ignore comments and strings roughly
        for char_num, char in enumerate(line, start=1):
            if char in '({[':
                stack.append((char, line_num, char_num, line))
            elif char in ')}]':
                if not stack:
                    print(f"Extra closing character '{char}' at line {line_num}, column {char_num}:")
                    print(line)
                    return
                top, l_num, c_num, orig_line = stack.pop()
                if (char == ')' and top != '(') or (char == '}' and top != '{') or (char == ']' and top != '['):
                    print(f"Mismatch: opened '{top}' at line {l_num} and closed with '{char}' at line {line_num}:")
                    print(f"Open line: {orig_line}")
                    print(f"Close line: {line}")
                    return
                    
    if stack:
        print(f"Unclosed braces/brackets left: {len(stack)}")
        for item in stack[:5]:
            print(f"Unclosed '{item[0]}' opened at line {item[1]}:")
            print(item[3])
    else:
        print("Braces and brackets are perfectly balanced!")

if __name__ == '__main__':
    check_brackets()
