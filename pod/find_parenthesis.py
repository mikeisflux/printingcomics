def check_parens():
    with open('/Users/maurapowers/Desktop/philbo-portal/src/pages/RetailerPortal.jsx', 'r') as f:
        code = f.read()
        
    stack = []
    lines = code.splitlines()
    
    for line_num, line in enumerate(lines, start=1):
        for char_num, char in enumerate(line, start=1):
            if char == '(':
                stack.append((char, line_num, char_num))
            elif char == ')':
                if not stack:
                    print(f"Extra closing paren at line {line_num}, col {char_num}")
                    return
                stack.pop()
                
    print(f"Paren stack size: {len(stack)}")
    for item in stack[:5]:
        print(f"Unclosed paren opened at line {item[1]}")

if __name__ == '__main__':
    check_parens()
