def check_zero():
    with open('/Users/maurapowers/Desktop/philbo-portal/src/pages/RetailerPortal.jsx', 'r') as f:
        code = f.read()
        
    lines = code.splitlines()
    stack = []
    
    for line_num, line in enumerate(lines, start=1):
        if line_num > 224:
            break
            
        for char_num, char in enumerate(line, start=1):
            # Very basic string check
            if char == '{':
                stack.append(line_num)
            elif char == '}':
                if stack:
                    stack.pop()
                    if len(stack) == 0:
                        print(f"Brace stack dropped to 0 at line {line_num}!")
                else:
                    print(f"Extra closing brace at line {line_num}")

if __name__ == '__main__':
    check_zero()
