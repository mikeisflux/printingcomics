<?php
/**
 * @package    HaruTheme
 * @version    1.0.0
 * @author     Administrator <admin@harutheme.com>
 * @copyright  Copyright 2022, HaruTheme
*/

$haru_bottom_toolbar = haru_get_option( 'haru_bottom_toolbar', 'hide' );

if ( $haru_bottom_toolbar == 'hide' ) return;

$bottom_toolbar_class[] = 'haru-toolbar--loading';
?>
    <div id="haru-bottom-toolbar" class="<?php echo esc_attr( join( ' ', $bottom_toolbar_class ) ); ?>">
        <?php
            $footer_id = haru_get_option( 'haru_bottom_toolbar_template', '' );
            haru_render_footer_layout( $footer_id );
        ?>
    </div>
<?php
