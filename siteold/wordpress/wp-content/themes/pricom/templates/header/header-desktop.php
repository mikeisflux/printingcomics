<?php
/**
 * @package    HaruTheme
 * @version    1.0.0
 * @author     Administrator <admin@harutheme.com>
 * @copyright  Copyright 2022, HaruTheme
*/

$header_class = array( 'haru-header haru-header--main', 'haru-header--desktop' );

$header_transparent = get_post_meta( get_the_ID(), 'haru_header_transparent', true );
if ( ( $header_transparent == '' ) || ( $header_transparent == '-1' ) || ( $header_transparent == 'default' ) ) {
    $header_transparent = haru_get_option( 'haru_header_transparent', '0' );
}

if ( $header_transparent == '1' ) {
    $header_class[] = 'haru-header--transparent';
}

$header_transparent_skin = get_post_meta( get_the_ID(), 'haru_header_transparent_skin', true );
if ( ( $header_transparent_skin == '' ) || ( $header_transparent_skin == '-1' ) || ( $header_transparent_skin == 'default' ) ) {
    $header_transparent_skin = haru_get_option( 'haru_header_transparent_skin', 'light' );
}

if ( $header_transparent == '1' ) {
    $header_class[] = 'haru-header--transparent-' . $header_transparent_skin;
}

$header_sticky = get_post_meta( get_the_ID(), 'haru_header_sticky', true );
if ( ( $header_sticky == '' ) || ( $header_sticky == '-1' ) || ( $header_sticky == 'default' ) ) {
    $header_sticky = haru_get_option( 'haru_header_sticky', '0' );
}

if ( $header_sticky == '1' ) {
    $header_class[] = 'haru-header--sticky';
}

$header_sticky_element = get_post_meta( get_the_ID(), 'haru_header_sticky_element', true );
if ( ( $header_sticky_element == '' ) || ( $header_sticky_element == '-1' ) || ( $header_sticky_element == 'default' ) ) {
    $header_sticky_element = haru_get_option( 'haru_header_sticky_element', 'header' );
}

if ( $header_sticky == '1' ) {
    $header_class[] = 'haru-header--sticky-' . $header_sticky_element;
}

// Header Sidebar
$header_id = apply_filters( 'haru_get_header_layout', haru_get_header_layout() );
$header_sidebar = get_post_meta( $header_id, 'haru_header_sidebar', true );
if ( $header_sidebar == '1' ) {
    $header_class[] = 'haru-header--sidebar';
    $header_sidebar_hidden = get_post_meta( $header_id, 'haru_header_sidebar_hidden', true );
    $header_class[] = 'haru-header--sidebar-hidden-' . $header_sidebar_hidden;
}

// Header Elementor Initial
$header_class[] = 'haru-header--loading';

?>
<header id="haru-header" class="<?php echo esc_attr( join( ' ', $header_class ) ); ?>">
    <div class="haru-header__desktop">
        <?php
            $header_id = apply_filters( 'haru_get_header_layout', haru_get_header_layout() );
            haru_render_header_layout( $header_id );
        ?>
    </div>
</header>