<?php
/**
 * The Template for displaying product archives, including the main shop page which is a post type archive
 *
 * This template can be overridden by copying it to yourtheme/woocommerce/archive-product.php.
 *
 * HOWEVER, on occasion WooCommerce will need to update template files and you
 * (the theme developer) will need to copy the new files to your theme to
 * maintain compatibility. We try to do this as little as possible, but it does
 * happen. When this occurs the version of the template file will be bumped and
 * the readme will list any important changes.
 *
 * @see https://docs.woocommerce.com/document/template-structure/
 * @package WooCommerce/Templates
 * @version 3.4.0
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

// Process Archive layout
$archive_product_layout = isset($_GET['layout']) ? $_GET['layout'] : '';
if( !in_array($archive_product_layout, array('full', 'container')) ) {
    $archive_product_layout = haru_get_option('haru_archive_product_layout');
}
// Set default
if ( empty($archive_product_layout) ) {
    $archive_product_layout = 'container';
}

// Process sidebar
$archive_product_sidebar = isset($_GET['sidebar']) ? $_GET['sidebar'] : '';
if( !in_array($archive_product_sidebar, array('none','left','right')) ) {
    $archive_product_sidebar = haru_get_option('haru_archive_product_sidebar');
}
// Set default
if ( empty($archive_product_sidebar) ) {
    $archive_product_sidebar = 'left';
}

$archive_product_left_sidebar  = haru_get_option('haru_archive_product_left_sidebar');
$archive_product_right_sidebar = haru_get_option('haru_archive_product_right_sidebar');

// Set default
if ( empty($archive_product_left_sidebar) ) {
    $archive_product_left_sidebar = 'woocommerce';
}

if( $archive_product_sidebar != 'none' && (!empty($archive_product_left_sidebar) || !empty($archive_product_right_sidebar)) ) {
    if ( is_active_sidebar( $archive_product_left_sidebar ) || is_active_sidebar( $archive_product_right_sidebar ) ) {
        $archive_product_content_col = 9;
    } else {
        $archive_product_content_col = 12;
    }
} else {
    $archive_product_content_col = 12;
}

// Process display columns and paging style
$archive_product_display_columns = isset($_GET['columns']) ? $_GET['columns'] : '';
if ( !in_array( $archive_product_display_columns, array('2','3','4') ) ) {
    $archive_product_display_columns = haru_get_option('haru_product_display_columns');
}
// Set default
if ( empty($archive_product_display_columns) ) {
    $archive_product_display_columns = '3';
};

get_header( 'shop' );

/**
 * Hook: woocommerce_before_main_content.
 *
 * @hooked woocommerce_output_content_wrapper - 10 (outputs opening divs for the content)
 * @hooked woocommerce_breadcrumb - 20
 * @hooked WC_Structured_Data::generate_website_data() - 30
 */
remove_action( 'woocommerce_before_main_content', 'woocommerce_breadcrumb', 20 );
do_action( 'woocommerce_before_main_content' );

// Enqueue assets
wp_enqueue_script( 'imagesloaded' );
wp_enqueue_script( 'isotope' );
?>

<?php
    /**
     * @hooked - haru_archive_product_heading - 5
     **/
    // do_action('haru_before_archive_product');
?>

<?php
    /**
     * @hooked - haru_page_heading - 5
     **/
    do_action( 'haru_before_page' );
?>

<div class="haru-archive-product">
    <?php
    /**
     * @hooked - haru_shop_page_content - 5
     **/
    do_action('haru_before_archive_product_listing');
    ?>

    <?php if ( $archive_product_layout != 'full' ) : ?>
        <div class="<?php echo esc_attr($archive_product_layout) ?> clearfix">
    <?php endif; ?>

        <?php
            /**
             * Hook: woocommerce_archive_description.
             *
             * @hooked woocommerce_taxonomy_archive_description - 10
             * @hooked woocommerce_product_archive_description - 10
             */
            do_action( 'woocommerce_archive_description' );
        ?>

        <?php if ( ($archive_product_content_col != 12) || ($archive_product_layout != 'full') ) : ?>
        <div class="row clearfix">
        <?php endif; ?>



            <div class="col-md-<?php echo esc_attr($archive_product_content_col); ?> <?php if( is_active_sidebar( $archive_product_left_sidebar ) && ($archive_product_sidebar == 'left') ) echo esc_attr('has-left-sidebar'); ?> col-sm-12 col-xs-12">
                
                <div class="archive-product-wrapper clearfix">

                    <?php if ( woocommerce_product_loop() ) : ?>

                        <div class="archive-product-filter">
                            <!-- Change default shop layout -->
                            <div class="gridlist-toggle">
                                <span id="grid"><i class="fa fa-th-large"></i></span>
                                <span id="list"><i class="fa fa-bars"></i></span>
                            </div>
                            <div class="catalog-filter">
                            <?php
                                /**
                                 * woocommerce_before_shop_loop hook
                                 *
                                 * @hooked woocommerce_result_count - 20
                                 * @hooked woocommerce_catalog_ordering - 30
                                 */
                                do_action( 'woocommerce_before_shop_loop' );
                            ?>
                            </div>
                        </div>

                        <?php 
                            woocommerce_product_loop_start();

                            if ( wc_get_loop_prop( 'total' ) ) {
                                while ( have_posts() ) {
                                    the_post();

                                    /**
                                     * Hook: woocommerce_shop_loop.
                                     *
                                     * @hooked WC_Structured_Data::generate_product_data() - 10
                                     */
                                    do_action( 'woocommerce_shop_loop' );

                                    wc_get_template_part( 'content', 'product' );
                                }
                            }

                            woocommerce_product_loop_end();
                        ?>

                        <?php
                            /**
                             * woocommerce_after_shop_loop hook.
                             *
                             * @hooked woocommerce_pagination - 10
                             */
                            do_action( 'woocommerce_after_shop_loop' );
                        ?>

                    <?php else : ?>

                        <?php 
                            /**
                             * Hook: woocommerce_no_products_found.
                             *
                             * @hooked wc_no_products_found - 10
                             */
                            do_action( 'woocommerce_no_products_found' );
                        ?>

                    <?php endif; ?>

                </div>
            </div>

            <?php if ( is_active_sidebar( $archive_product_left_sidebar ) && ($archive_product_sidebar == 'left') ) : ?>
                <div class="archive-product-sidebar woocommerce-sidebar left-sidebar col-xs-12 col-sm-12 col-md-3">
                    <?php dynamic_sidebar( $archive_product_left_sidebar ); ?>
                </div>
            <?php endif; ?>

            <?php if (is_active_sidebar( $archive_product_right_sidebar ) && ($archive_product_sidebar == 'right') ) : ?>
                <div class="archive-product-sidebar woocommerce-sidebar right-sidebar col-md-3 col-sm-12 col-xs-12">
                    <?php dynamic_sidebar( $archive_product_right_sidebar ); ?>
                </div>
            <?php endif; ?>

        <?php if ( ($archive_product_content_col != 12) || ($archive_product_layout != 'full') ) : ?>
            </div>
        <?php endif; ?>

    <?php if ( $archive_product_layout != 'full' ) : ?>
        </div>
    <?php endif; ?>

    <?php
        /**
         * @hooked - haru_shop_page_content - 5
         **/
        do_action('haru_after_archive_product_listing');
    ?>
</div>
<?php
    /**
     * Hook: woocommerce_after_main_content.
     *
     * @hooked woocommerce_output_content_wrapper_end - 10 (outputs closing divs for the content)
     */
    do_action( 'woocommerce_after_main_content' ); 
?>
<?php get_footer( 'shop' ); ?>