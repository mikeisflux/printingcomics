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
 * @see https://woocommerce.com/document/template-structure/
 * @package WooCommerce\Templates
 * @version 8.6.0
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

// Process Archive Product options: https://gist.github.com/Bradley-D/7287723 or wc_get_page_id( 'shop' )
$shop_page_id = get_option( 'woocommerce_shop_page_id' );
$archive_layout = get_post_meta( $shop_page_id, 'haru_layout', true );
if ( ( $archive_layout == '' ) || ( $archive_layout == 'default' ) ) {
    $archive_layout = haru_get_option( 'haru_archive_product_layout', 'haru-container' );
}

$archive_sidebar = get_post_meta( $shop_page_id, 'haru_sidebar', true );

if ( ( $archive_sidebar == '' ) || ( $archive_sidebar == 'default' ) ) {
    $archive_sidebar = haru_get_option( 'haru_archive_product_sidebar', 'left' );
}

$archive_left_sidebar = get_post_meta( $shop_page_id, 'haru_left_sidebar', true );
if ( ( $archive_left_sidebar == '' ) || ( $archive_left_sidebar == 'default' ) ) {
    $archive_left_sidebar = haru_get_option( 'haru_archive_product_left_sidebar', 'woocommerce' );
}

$archive_right_sidebar = get_post_meta( $shop_page_id, 'haru_right_sidebar', true );
if ( ( $archive_right_sidebar == '' ) || ( $archive_right_sidebar == 'default' ) ) {
    $archive_right_sidebar = haru_get_option( 'haru_archive_product_right_sidebar', 'woocommerce' );
}

$hidden_sidebar_layout = haru_get_option( 'haru_archive_product_hidden_sidebar_layout', '0' );
$hidden_sidebar_style = haru_get_option( 'haru_archive_product_hidden_sidebar_style', 'fixed' );
$archive_hidden_sidebar = haru_get_option( 'haru_archive_product_hidden_sidebar', 'woocommerce' );

$widget_toggle = haru_get_option( 'haru_archive_product_widget_toggle', true );

// Mobile
$hidden_sidebar_mobile_layout = haru_get_option( 'haru_archive_product_hidden_sidebar_mobile_layout', '0' );
$hidden_sidebar_mobile_style = haru_get_option( 'haru_archive_product_hidden_sidebar_mobile_style', 'fixed' );
$archive_hidden_sidebar_mobile = haru_get_option( 'haru_archive_product_hidden_sidebar_mobile', 'woocommerce' );

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

// Use for Demo
if ( isset( $_GET['hidden_sidebar_layout'] ) ) {
    $hidden_sidebar_layout = wc_clean( $_GET['hidden_sidebar_layout'] );
}

if ( isset( $_GET['hidden_sidebar_style'] ) ) {
    $hidden_sidebar_style = wc_clean( $_GET['hidden_sidebar_style'] ); // fixed, toggle
}

?>

<?php
    /**
     * Hook: woocommerce_shop_loop_header.
     *
     * @since 8.6.0
     *
     * @hooked woocommerce_product_taxonomy_archive_header - 10
     */

    remove_action( 'woocommerce_shop_loop_header', 'woocommerce_product_taxonomy_archive_header', 10 );
    do_action( 'woocommerce_shop_loop_header' );
?>

<?php
    /**
     * @hooked - haru_page_heading - 5
     **/
    do_action( 'haru_before_page' );
?>
<div class="woocommerce-products-header <?php echo esc_attr( $archive_layout ); ?>">
    <div class="h-row">
        <?php
        /**
         * Hook: woocommerce_archive_description.
         *
         * @hooked woocommerce_taxonomy_archive_description - 10
         * @hooked woocommerce_product_archive_description - 10
         */
        do_action( 'woocommerce_archive_description' );
        ?>
    </div>
</div>
<div class="haru-archive-product <?php echo esc_attr( $archive_layout ); ?>">
    <div class="h-row">

    	<!-- Content -->
        <?php if (  $hidden_sidebar_layout == '1' ) : ?>
    	<div class="archive-content has-hidden-sidebar">
        <?php else : ?>
        <div class="archive-content <?php if ( is_active_sidebar( $archive_left_sidebar ) && in_array( $archive_sidebar, array( 'left', 'two' ) ) ) echo esc_attr( 'has-left-sidebar' ); ?> <?php if ( is_active_sidebar( $archive_right_sidebar ) && in_array( $archive_sidebar, array( 'right', 'two' ) ) ) echo esc_attr( 'has-right-sidebar' ); ?>">
        <?php endif; ?>
            
            <div class="archive-product <?php echo woocommerce_get_loop_display_mode(); ?>">

                <?php
                    /**
                     * Hook: haru_before_archive_product_tools.
                     *
                     * @hooked - woocommerce_output_all_notices - 10
                     **/
                    add_action( 'haru_before_archive_product_tools', 'woocommerce_output_all_notices', 10 );
                    do_action( 'haru_before_archive_product_tools' );
                ?>

                <?php if ( woocommerce_product_loop() ) : ?>

                    <?php
                        if ( isset( $_COOKIE['shopDefaultLayout'] ) ) {
                            $shopDefaultLayout = $_COOKIE['shopDefaultLayout'];
                        } else {
                            $shopDefaultLayout = 'layout-grid';
                        }

                        // Use for Demo
                        if ( isset( $_GET['shop_layout'] ) ) {
                            $shopDefaultLayout = 'layout-' . wc_clean( $_GET['shop_layout'] );
                        }

                        // 
                        if ( '1' == $hidden_sidebar_layout ) {
                            $filter_class = 'hidden-' . $hidden_sidebar_style;
                        } else {
                            $filter_class = '';

                            if ( '1' == $hidden_sidebar_mobile_layout ) {
                                $filter_class .= ' hidden-' . $hidden_sidebar_mobile_style;
                            }
                        }
                    ?>
                    <div class="shop-filter <?php echo esc_attr( $filter_class ); ?>">
                        <?php if (  $hidden_sidebar_layout == '1' ) : ?>
                            <?php if ( $hidden_sidebar_style == 'fixed' ) : ?>
                                <div class="shop-filter__sidebar-btn">
                                    <?php echo esc_html__( 'Show filters', 'pricom' ); ?>
                                </div>
                            <?php else : ?>
                                <div class="shop-filter__sidebar-btn-toggle">
                                    <?php echo esc_html__( 'Filters', 'pricom' ); ?>
                                </div>
                            <?php endif; ?>
                        <?php else : ?>
                            <?php if ( $hidden_sidebar_mobile_layout == '1' ) : ?>
                                <?php if ( $hidden_sidebar_mobile_style == 'fixed' ) : ?>
                                    <div class="shop-filter__sidebar-btn hidden-on-desktop">
                                        <?php echo esc_html__( 'Show filters', 'pricom' ); ?>
                                    </div>
                                <?php else : ?>
                                    <div class="shop-filter__sidebar-btn-toggle hidden-on-desktop">
                                        <?php echo esc_html__( 'Filters', 'pricom' ); ?>
                                    </div>
                                <?php endif; ?>
                            <?php endif; ?>
                        <?php endif; ?>

                        <div class="shop-filter__catalog">
    	                    <?php
    	                        /**
                                 * Hook: woocommerce_before_shop_loop.
                                 *
                                 * @hooked woocommerce_output_all_notices - 10
                                 * @hooked woocommerce_result_count - 20
                                 * @hooked woocommerce_catalog_ordering - 30
                                 */
                                remove_action( 'woocommerce_before_shop_loop', 'woocommerce_output_all_notices', 10 );
                                do_action( 'woocommerce_before_shop_loop' );
    	                    ?>
                        </div>
                        <div class="shop-filter__layout">
                            <span class="shop-filter__label"><?php echo esc_html__( 'See', 'pricom' ); ?></span>
                            <span class="shop-filter__grid <?php echo esc_attr( ( $shopDefaultLayout == 'layout-grid' ) ? 'active' : '' ); ?>"></span>
                            <span class="shop-filter__list <?php echo esc_attr( ( $shopDefaultLayout == 'layout-list' ) ? 'active' : '' ); ?>"></span>
                        </div>
                    </div>

                    <?php if ( $hidden_sidebar_layout == '1' ) : ?>
                        <?php if ( is_active_sidebar( $archive_hidden_sidebar ) ) : ?>
                            <?php if ( $hidden_sidebar_style == 'toggle' ) : ?>
                                <div class="filters-area <?php echo esc_attr( ( $widget_toggle == true ) ? 'widget-toggle' : '' ); ?>">
                                    <div class="filters-area__content">
                                        <?php dynamic_sidebar( $archive_hidden_sidebar ); ?>
                                    </div>
                                </div>
                            <?php endif; ?>
                        <?php endif; ?>
                    <?php else : ?>
                        <?php if ( $hidden_sidebar_mobile_layout == '1' ) : ?>
                            <?php if ( is_active_sidebar( $archive_hidden_sidebar_mobile ) ) : ?>
                                <?php if ( $hidden_sidebar_mobile_style == 'toggle' ) : ?>
                                    <div class="filters-area <?php echo esc_attr( ( $widget_toggle == true ) ? 'widget-toggle' : '' ); ?>">
                                        <div class="filters-area__content">
                                            <?php dynamic_sidebar( $archive_hidden_sidebar_mobile ); ?>
                                        </div>
                                    </div>
                                <?php endif; ?>
                            <?php endif; ?>
                        <?php endif; ?>
                    <?php endif; ?>

                    <div class="haru-active-filters">
                        <?php 

                            do_action( 'haru_before_active_filters_widgets' );

                            the_widget( 
                                'WC_Widget_Layered_Nav_Filters', 
                                array(
                                    'title' => ''
                                ),
                                array() 
                            );

                            do_action( 'haru_after_active_filters_widgets' );

                        ?>
                    </div>

                    <?php 
                        woocommerce_product_loop_start();

                        if ( wc_get_loop_prop( 'total' ) ) {
                            while ( have_posts() ) {
                                the_post();

                                /**
                                 * Hook: woocommerce_shop_loop.
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

        <!-- Sidebar -->
        <?php if (  $hidden_sidebar_layout == '1' ) : ?>
            <?php if ( is_active_sidebar( $archive_hidden_sidebar ) ) : ?>
                <?php if ( $hidden_sidebar_style == 'fixed' ) : ?>
                <div class="hidden-sidebar-overlay"></div>
                <div class="archive-sidebar hidden-sidebar <?php echo esc_attr( ( $widget_toggle == true ) ? 'widget-toggle' : '' ); ?>">
                    <div class="hidden-sidebar__header"><span class="hidden-sidebar__close"><?php echo esc_html__( 'Close', 'pricom' ); ?></span></div>
                    <div class="hidden-sidebar__content haru-scroll-content">
                        <?php dynamic_sidebar( $archive_hidden_sidebar ); ?>
                    </div>
                </div>
                <?php endif; ?>
            <?php endif; ?>
        <?php else : ?>
            <?php if ( is_active_sidebar( $archive_left_sidebar ) && in_array( $archive_sidebar, array( 'left', 'two' ) ) ) : ?>
                <div class="archive-sidebar left-sidebar <?php if ( $hidden_sidebar_mobile_layout == '1' ) echo 'hidden-on-mobile'; ?> <?php echo esc_attr( ( $widget_toggle == true ) ? 'widget-toggle' : '' ); ?>">
                    <?php dynamic_sidebar( $archive_left_sidebar ); ?>
                </div>
            <?php endif; ?>
            <?php if ( is_active_sidebar( $archive_right_sidebar ) && in_array( $archive_sidebar, array( 'right', 'two' ) ) ) : ?>
                <div class="archive-sidebar right-sidebar <?php if ( $hidden_sidebar_mobile_layout == '1' ) echo 'hidden-on-mobile'; ?> <?php echo esc_attr( ( $widget_toggle == true ) ? 'widget-toggle' : '' ); ?>">
                    <?php dynamic_sidebar( $archive_right_sidebar );?>
                </div>
            <?php endif; ?>

            <?php if (  $hidden_sidebar_mobile_layout == '1' ) : ?>
                <?php if ( is_active_sidebar( $archive_hidden_sidebar_mobile ) ) : ?>
                    <?php if ( $hidden_sidebar_mobile_style == 'fixed' ) : ?>
                    <div class="hidden-sidebar-overlay"></div>
                    <div class="archive-sidebar hidden-sidebar <?php echo esc_attr( ( $widget_toggle == true ) ? 'widget-toggle' : '' ); ?>">
                        <div class="hidden-sidebar__header"><span class="hidden-sidebar__close"><?php echo esc_html__( 'Close', 'pricom' ); ?></span></div>
                        <div class="hidden-sidebar__content haru-scroll-content">
                            <?php dynamic_sidebar( $archive_hidden_sidebar_mobile ); ?>
                        </div>
                    </div>
                    <?php endif; ?>
                <?php endif; ?>
            <?php endif; ?>
        <?php endif; ?>
    </div>
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