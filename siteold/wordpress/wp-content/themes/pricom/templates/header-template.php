<?php
/**
 * @package    HaruTheme
 * @version    1.0.0
 * @author     Administrator <admin@harutheme.com>
 * @copyright  Copyright 2022, harutheme
*/

$haru_header_layout = haru_get_header_layout();

// Show Header
$header_show_hide = '1'; // Always show header (can add option in metabox to hide header on special page)
?>
<?php if ( $header_show_hide == '1' ) : ?>
    <?php
    	if ( $haru_header_layout ) :
    		get_template_part( 'templates/header/' . 'header-desktop' );
		else :
			get_template_part( 'templates/header/' . 'header-default' );
		endif;
    ?>
<?php endif; ?>