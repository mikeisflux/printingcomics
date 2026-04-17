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
    $header_sticky = haru_get_option( 'haru_header_sticky', '1' );
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

?>
<header id="haru-header" class="<?php echo esc_attr( join( ' ', $header_class ) ); ?>">
    <div class="haru-header-default">
        <?php
            $logo_url = get_template_directory_uri() . '/framework/admin-assets/images/theme-options/logo.png';
            $logo_retina_url = get_template_directory_uri() . '/framework/admin-assets/images/theme-options/logo@2x.png'
        ?>
        <div class="haru-logo haru-logo--left">
            <a href="<?php echo esc_url( home_url( '/' ) ); ?>">
                <img src="<?php echo esc_url( $logo_url ); ?>" class="haru-logo__default" alt="<?php echo esc_attr( get_bloginfo( 'name', 'display' ) ); ?> - <?php bloginfo( 'description' ); ?>">
                <img src="<?php echo esc_url( $logo_retina_url ); ?>" class="haru-logo__retina" alt="<?php echo esc_attr( get_bloginfo( 'name', 'display' ) ); ?> - <?php bloginfo( 'description' ); ?>">
            </a>
        </div>

        <div class="haru-header-content">
            <?php if ( has_nav_menu( 'primary-menu' ) ) : ?>
                <!-- Primary Menu -->
                <div class="haru-menu-default">
                    <div id="header-primary-menu" class="menu-wrap">
                        <?php
                            $arg_menu = array(
                                'menu_id'        => 'main-menu',
                                'container'      => '',
                                'theme_location' => 'primary-menu',
                                'menu_class'     => 'haru-main-menu',
                                'fallback_cb'    => 'haru_please_set_menu',
                                'walker'         => new Walker_Nav_Menu()
                            );
                            wp_nav_menu( $arg_menu );
                        ?>
                    </div>
                    <div class="haru-toggle-default"><span></span></div>
                </div>
            <?php endif; ?>

            <?php if ( class_exists( 'WooCommerce' ) ) : ?>
            <div class="header-cart-default haru-cart">
                <div class="haru-cart-wrap no-price">
                    <div class="haru-cart-opener">
                        <a href="<?php echo esc_url( wc_get_cart_url() ); ?>" title="<?php echo esc_attr__( 'Shopping cart', 'pricom' ); ?>">
                            <div class="haru-cart-icon"><?php haru_cart_count(); ?></div>
                            <div class="haru-cart-sub-total"><?php haru_cart_subtotal(); ?></div>
                        </a>
                    </div>
                    <div class="haru-cart-content">
                        <div class="widget_shopping_cart_content">
                            <?php get_template_part( 'woocommerce/cart/mini-cart' ); ?>
                        </div>
                    </div>
                </div>
            </div>
            <?php endif; ?>
        </div>
    </div>
</header>

<?php get_template_part( 'templates/header/', 'header-mobile' ); ?>

