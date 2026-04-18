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
 * @see         https://docs.woocommerce.com/document/template-structure/
 * @author      WooThemes
 * @package     WooCommerce/Templates
 * @version     3.3.0
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit; // Exit if accessed directly
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

$archive_product_display_columns = isset($_GET['columns']) ? $_GET['columns'] : '';
if ( !in_array( $archive_product_display_columns, array('2','3','4') ) ) {
    $archive_product_display_columns = haru_get_option('haru_product_display_columns'); // Use in Appearnace -> Woo settings
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
wp_enqueue_script( 'haru-shop-ajax' );

?>

<?php
    /**
     * @hooked - haru_archive_product_heading - 5
     **/
    do_action('haru_before_archive_product');
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

        <?php if ($archive_product_layout != 'full') : ?>
        <div class="row clearfix">
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

            <div class="col-md-12 col-sm-12 col-xs-12">
                <div class="archive-product-filter clearfix">
                    <!-- Ajax filter style top sidebar -->
                    <div class="archive-product-header">
                        <div class="row">
                            <div class="col-md-12">
                                <ul id="haru-shop-filter-menu" class="haru-shop-filter-menu">
                                    <?php if ( haru_get_option('haru_ajax_show_categories') == true ) : ?>
                                    <li class="haru-shop-categories-btn-wrap" data-panel="cat">
                                        <a href="#categories" class="invert-color"><?php echo esc_html__( 'Categories', 'pricom' ); ?></a>
                                    </li>
                                    <?php endif; ?>
                                    <?php if ( haru_get_option('haru_ajax_show_filters') ) : ?>
                                        <li class="haru-ajax-filter" data-panel="filter">
                                            <a href="#filter" class="invert-color"><?php echo esc_html__( 'Filter', 'pricom' ); ?></a>
                                        </li>
                                    <?php endif; ?>
                                    <?php if ( haru_get_option('haru_ajax_show_search') ) : ?>
                                        <li class="haru-shop-search-btn-wrap haru-ajax-search" data-panel="search">
                                            <?php if ( haru_get_option('haru_ajax_show_filters') ) : ?>
                                                <span>&frasl;</span>
                                            <?php endif;?>
                                            <a href="#search" id="haru-shop-search-btn" class="invert-color">
                                                <span><?php echo esc_html__( 'Search', 'pricom' ); ?></span>
                                                <i class="haru-font haru-font-search-alt flip"></i>
                                            </a>
                                        </li>
                                    <?php endif; ?>
                                </ul>
                                <?php if ( haru_get_option('haru_ajax_show_categories') == true ) : ?>
                                    <ul id="haru-shop-categories" class="haru-shop-categories">
                                        <?php echo wp_kses_normalize_entities( haru_category_menu() ); ?>
                                    </ul>
                                <?php endif; ?>
                            </div>
                        </div>
                        <div class="row">
                            <div class="col-md-12">
                                <div id="haru-shop-sidebar" class="haru-shop-sidebar">
                                    <div id="haru-shop-widgets-ul" class="archive-product-sidebar woocommerce-sidebar-ajax">
                                        <?php dynamic_sidebar( 'woocommerce_ajax_filter' ); ?>
                                    </div>
                                </div>
                                <div class="clearfix"></div>
                                <div id="haru-shop-search" class="haru-shop-search">
                                    <div class="haru-shop-search-input-wrap">
                                        <a href="#" id="haru-shop-search-close"><i class="fa fa-times"></i></a>
                                        <form role="search" method="get" class="search-form" action="<?php echo esc_url( home_url('/') ); ?>">
                                            <input type="text" id="haru-shop-search-input" autocomplete="off" value="" name="s" placeholder="<?php echo esc_attr__( 'Search Products', 'pricom' ); ?>" />
                                            <input type="hidden" name="post_type" value="product" />
                                        </form>
                                    </div>

                                    <div id="haru-shop-search-notice"><span><?php printf( esc_html__( 'press %sEnter%s to search', 'pricom' ), '<u>', '</u>' ); ?></span></div>
                                </div>
                                <div class="clearfix"></div>
                            </div>
                        </div>
                    </div>
                    <!-- End ajax filter top sidebar -->
                </div>

                <div class="archive-product-wrapper clearfix">
                    <!-- Overlay loader -->
                    <div id="haru-shop-products-overlay" class="haru-loader"><i class="fa fa-spinner fa-spin"></i></div>
                    <!-- Results bar/button -->
                    <?php wc_get_template_part( 'archive', 'product-results-bar' ); ?>
                    
                    <?php if ( have_posts() ) : ?>

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

                        <div class="haru-loadmore-wrapper">
                            <div class="haru-loadmore-link"><?php next_posts_link( '&nbsp;' ); ?></div>

                            <div class="haru-loadmore-controls">
                                <a href="#" class="haru-loadmore-btn"><i class="fa fa-spinner fa-spin"></i><?php echo esc_html__( 'Load More', 'pricom' ); ?></a>
                                
                                <p class="haru-loadmore-all"><?php echo esc_html__( 'All products loaded.', 'pricom' ); ?></p>
                            </div>
                        </div>

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

        <?php if ($archive_product_layout != 'full') : ?>
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