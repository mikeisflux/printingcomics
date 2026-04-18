<?php
/**
 * The Template for displaying all single posts.
 *
 * @package dokan
 * @package dokan - 2014 1.0
 */

if ( ! defined( 'ABSPATH' ) ) exit; // Exit if accessed directly

$store_user   = dokan()->vendor->get( get_query_var( 'author' ) );
$store_info   = $store_user->get_shop_info();
$map_location = $store_user->get_location();
$layout       = get_theme_mod( 'store_layout', 'left' );

get_header( 'shop' );

if ( function_exists( 'yoast_breadcrumb' ) ) {
    yoast_breadcrumb( '<p id="breadcrumbs">', '</p>' );
}

$haru_show_title = haru_get_option( 'haru_show_archive_product_title', '1' );
$haru_title_layout = haru_get_option( 'haru_archive_product_title_layout', 'full-width' );
$haru_title_content_layout = haru_get_option( 'haru_archive_product_title_content_layout', 'haru-container' );
$haru_title_breadcrumbs = haru_get_option( 'haru_archive_product_title_breadcrumbs', '1' );
$archive_layout = haru_get_option( 'haru_archive_product_layout', 'haru-container' );
?>

<?php if ( $haru_show_title == '1' ) : ?>
    <div class="haru-page-title <?php echo esc_attr( $haru_title_layout ); ?> dokan-page-title">
        <div class="haru-page-title__content <?php echo esc_attr( $haru_title_content_layout ); ?>">
            <?php if ( $haru_title_breadcrumbs == '1' ) : ?>
                <div class="haru-page-title__breadcrumbs">
                    <?php
                        $args = array(
                            'delimiter' => '',  
                            'wrap_before' => '<nav class="woocommerce-breadcrumb">',  
                            'wrap_after' => '</nav>',  
                            'before' => '',  
                            'after' => '',  
                            'home' => _x( 'Home', 'breadcrumb', 'pricom' ),  
                        );

                        woocommerce_breadcrumb( $args );
                    ?>
                </div>
            <?php endif; ?>
        </div>
    </div>
<?php endif; ?>

<?php remove_action( 'woocommerce_before_main_content', 'woocommerce_breadcrumb', 20 ); ?>
<?php do_action( 'woocommerce_before_main_content' ); ?>

<div class="<?php echo esc_attr( $archive_layout ); ?>">
    <div class="dokan-store-wrap layout-<?php echo esc_attr( $layout ); ?>">

        <?php if ( 'left' === $layout ) { ?>
            <?php dokan_get_template_part( 'store', 'sidebar', array( 'store_user' => $store_user, 'store_info' => $store_info, 'map_location' => $map_location ) ); ?>
        <?php } ?>

        <div id="dokan-primary" class="dokan-single-store">
            <div id="dokan-content" class="store-page-wrap woocommerce" role="main">

                <?php dokan_get_template_part( 'store-header' ); ?>

                <?php do_action( 'dokan_store_profile_frame_after', $store_user->data, $store_info ); ?>

                <?php if ( have_posts() ) { ?>

                    <div class="seller-items">

                        <?php woocommerce_product_loop_start(); ?>

                            <?php while ( have_posts() ) : the_post(); ?>

                                <?php wc_get_template_part( 'content', 'product' ); ?>

                            <?php endwhile; // end of the loop. ?>

                        <?php woocommerce_product_loop_end(); ?>

                    </div>

                    <?php dokan_content_nav( 'nav-below' ); ?>

                <?php } else { ?>

                    <p class="dokan-info"><?php esc_html_e( 'No products were found of this vendor!', 'pricom' ); ?></p>

                <?php } ?>
            </div>

        </div><!-- .dokan-single-store -->

        <?php if ( 'right' === $layout ) { ?>
            <?php dokan_get_template_part( 'store', 'sidebar', array( 'store_user' => $store_user, 'store_info' => $store_info, 'map_location' => $map_location ) ); ?>
        <?php } ?>

    </div><!-- .dokan-store-wrap -->

    <?php do_action( 'woocommerce_after_main_content' ); ?>
</div>

<?php get_footer( 'shop' ); ?>
