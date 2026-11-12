def trace_tags():
    with open('/Users/maurapowers/Desktop/philbo-portal/src/pages/RetailerPortal.jsx', 'r') as f:
        code = f.read()
        
    lines = code.splitlines()
    stack = []
    
    import re
    
    for line_num, line in enumerate(lines, start=1):
        if line_num > 785:
            break
            
        # Basic check for div tags opening/closing
        # We find all <div and </div in the line
        for m in re.finditer(r'<div|</div', line):
            tag = m.group(0)
            if tag == '<div':
                stack.append(line_num)
                # print(f"Open div at line {line_num}, stack size: {len(stack)}")
            else:
                if stack:
                    stack.pop()
                    # print(f"Close div at line {line_num}, stack size: {len(stack)}")
                else:
                    print(f"ERROR: Extra close div at line {line_num}")
                    
    print(f"At line 785, remaining open divs in stack: {len(stack)} (opened at lines: {stack})")

if __name__ == '__main__':
    trace_tags()
