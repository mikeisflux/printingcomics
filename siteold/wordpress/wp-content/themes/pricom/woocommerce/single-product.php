<?php
/**
 * The Template for displaying all single products
 *
 * This template can be overridden by copying it to yourtheme/woocommerce/single-product.php.
 *
 * HOWEVER, on occasion WooCommerce will need to update template files and you
 * (the theme developer) will need to copy the new files to your theme to
 * maintain compatibility. We try to do this as little as possible, but it does
 * happen. When this occurs the version of the template file will be bumped and
 * the readme will list any important changes.
 *
 * @see         https://docs.woocommerce.com/document/template-structure/
 * @package     WooCommerce\Templates
 * @version     1.6.4
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit; // Exit if accessed directly
}

$single_layout = get_post_meta( get_the_ID(), 'haru_layout', true );
if ( ( $single_layout == '' ) || ( $single_layout == 'default' ) ) {
    $single_layout = haru_get_option( 'haru_single_product_layout', 'haru-container' );
}

$single_sidebar = get_post_meta( get_the_ID(), 'haru_sidebar', true );

if ( ( $single_sidebar == '' ) || ( $single_sidebar == 'default' ) ) {
    $single_sidebar = haru_get_option( 'haru_single_product_sidebar', 'left' );
}

$single_left_sidebar = get_post_meta( get_the_ID(), 'haru_left_sidebar', true );
if ( ( $single_left_sidebar == '' ) || ( $single_left_sidebar == 'default' ) ) {
    $single_left_sidebar = haru_get_option( 'haru_single_product_left_sidebar', 'woocommerce' );
}

$single_right_sidebar = get_post_meta( get_the_ID(), 'haru_right_sidebar', true );
if ( ( $single_right_sidebar == '' ) || ( $single_right_sidebar == 'default' ) ) {
    $single_right_sidebar = haru_get_option( 'haru_single_product_right_sidebar', 'woocommerce' );
}

get_header( 'shop' ); ?>

<?php
/**
 * @hooked - haru_page_heading - 5
 **/
do_action('haru_before_page');
?>
<div class="haru-single-product <?php echo esc_attr( $single_layout ); ?>">
    <div class="h-row">
        <!-- Content -->
        <div class="single-content <?php if ( is_active_sidebar( $single_left_sidebar ) && in_array( $single_sidebar, array( 'left', 'two' ) ) ) echo esc_attr( 'has-left-sidebar' ); ?> <?php if ( is_active_sidebar( $single_right_sidebar ) && in_array( $single_sidebar, array( 'right', 'two' ) ) ) echo esc_attr( 'has-right-sidebar' ); ?>">

            <div class="single-product-inner">
                <?php
                    /**
                     * woocommerce_before_main_content hook.
                     *
                     * @hooked woocommerce_output_content_wrapper - 10 (outputs opening divs for the content)
                     * @hooked woocommerce_breadcrumb - 20
                     */
                    remove_action( 'woocommerce_before_main_content', 'woocommerce_breadcrumb', 20 );
                    do_action( 'woocommerce_before_main_content' );
                ?>
                
                <?php while ( have_posts() ) : ?>
                    <?php the_post(); ?>

                    <?php wc_get_template_part( 'content', 'single-product' ); ?>

                <?php endwhile; // end of the loop. ?>

                <?php
                    /**
                     * woocommerce_after_main_content hook.
                     *
                     * @hooked woocommerce_output_content_wrapper_end - 10 (outputs closing divs for the content)
                     */
                    do_action( 'woocommerce_after_main_content' );
                ?>

            </div>

        </div>

        <!-- Sidebar -->
        <?php if ( is_active_sidebar( $single_left_sidebar ) && in_array( $single_sidebar, array( 'left', 'two' ) ) ) : ?>
            <div class="single-sidebar left-sidebar">
                <?php dynamic_sidebar( $single_left_sidebar ); ?>
            </div>
        <?php endif; ?>
        <?php if ( is_active_sidebar( $single_right_sidebar ) && in_array( $single_sidebar, array( 'right', 'two' ) ) ) : ?>
            <div class="single-sidebar right-sidebar">
                <?php dynamic_sidebar( $single_right_sidebar );?>
            </div>
        <?php endif; ?>
    </div>
</div>
<?php get_footer( 'shop' ); ?>