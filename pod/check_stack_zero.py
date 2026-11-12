def check_zero():
    with open('/Users/maurapowers/Desktop/philbo-portal/src/pages/RetailerPortal.jsx', 'r') as f:
        code = f.read()
        
    lines = code.splitlines()
    stack = []
    
    import re
    
    for line_num, line in enumerate(lines, start=1):
        if line_num > 780:
            break
            
        for m in re.finditer(r'<div|</div', line):
            tag = m.group(0)
            if tag == '<div':
                stack.append(line_num)
            else:
                if stack:
                    stack.pop()
                    if len(stack) == 0:
                        print(f"Stack size dropped to 0 at line {line_num}!")
                else:
                    print(f"ERROR: Extra close div at line {line_num}")

if __name__ == '__main__':
    check_zero()
