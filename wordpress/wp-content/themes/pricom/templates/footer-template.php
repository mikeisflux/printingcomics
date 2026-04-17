<?php
/**
 * @package    HaruTheme
 * @version    1.0.0
 * @author     Administrator <admin@harutheme.com>
 * @copyright  Copyright 2022, harutheme
*/

$haru_footer_layout = haru_get_footer_layout();

// Show Footer
$footer_show_hide = '1'; // Always show footer (can add option in metabox to hide footer on special page)
?>
<?php if ( $footer_show_hide == '1' ) : ?>
    <?php
    	if ( $haru_footer_layout ) :
    		get_template_part( 'templates/footer/' . 'footer-desktop' );
		else :
			get_template_part( 'templates/footer/' . 'footer-default' );
		endif;
    ?>
<?php endif; ?>
