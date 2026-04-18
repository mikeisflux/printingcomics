<?php 
/*
 * TABLE OF WOOCOMMERCE FUNCTIONS
 * 1. Products per page
 * 2. Add new meta (HOT- NEW) for product
 * 3. Single product filter
 * 4. Product action (compare, wishlist, quickview)
 * 6. Remove some default WooCommerce hooks
 *
*/ 
if ( class_exists( 'WooCommerce' ) ) {
    /* Remove default style from WooCommerce */ 
    add_filter( 'woocommerce_enqueue_styles', '__return_empty_array' );

    /* 1. Filter products per page */
    if ( ! function_exists( 'haru_show_products_per_page' ) ) {
        function haru_show_products_per_page() {
            $product_per_page = haru_get_option( 'haru_product_per_page', 12 );
            $shop_per_page = isset( $_GET['shop_per_page'] ) ? wc_clean( $_GET['shop_per_page'] ) : $product_per_page;

            return $shop_per_page;
        }

        add_filter( 'loop_shop_per_page', 'haru_show_products_per_page' );
    }

    /* 2. Add meta NEW - HOT for product */
    // 2.1. Display Fields
    if ( ! function_exists( 'haru_woocommerce_add_custom_general_fields' ) ) {
        function haru_woocommerce_add_custom_general_fields() {
            echo '<div class="options_group">';
            woocommerce_wp_checkbox(
                array(
                    'id'    => 'haru_product_new',
                    'label' => esc_html__( 'Is New?', 'pricom' )
                )
            );
            woocommerce_wp_checkbox(
                array(
                    'id'    => 'haru_product_hot',
                    'label' => esc_html__( 'Is Hot?', 'pricom' )
                )
            );
            woocommerce_wp_text_input(
                array(
                    'id'    => 'haru_product_video_url',
                    'label' => esc_html__( 'Video Url', 'pricom' ),
                    'type' => 'url',
                    'placeholder' => esc_html__( 'Insert Youtube or Vimeo Url', 'pricom' )
                )
            );
            echo '</div>';
        }

        add_action( 'woocommerce_product_options_general_product_data', 'haru_woocommerce_add_custom_general_fields' );
    }

    // 2.2. Save Fields
    if ( ! function_exists( 'haru_woocommerce_add_custom_general_fields_save' ) ) {
        function haru_woocommerce_add_custom_general_fields_save( $post_id ) {
            $haru_product_new = isset( $_POST['haru_product_new'] ) ? 'yes' : 'no';
            update_post_meta( $post_id, 'haru_product_new', $haru_product_new );

            $haru_product_hot = isset( $_POST['haru_product_hot'] ) ? 'yes' : 'no';
            update_post_meta( $post_id, 'haru_product_hot', $haru_product_hot );

            $haru_product_video_url = isset( $_POST['haru_product_video_url'] ) ? $_POST['haru_product_video_url'] : '';
            update_post_meta( $post_id, 'haru_product_video_url', $haru_product_video_url );
        }

        add_action( 'woocommerce_process_product_meta', 'haru_woocommerce_add_custom_general_fields_save' );
    }

    // 2.3. Add custom column into Product Page
    if ( ! function_exists( 'haru_columns_into_product_list' ) ) {
        function haru_columns_into_product_list( $defaults ) {
            $defaults['haru_product_new'] = esc_html__( 'New', 'pricom' );
            $defaults['haru_product_hot'] = esc_html__( 'Hot', 'pricom' );

            return $defaults;
        }

        add_filter( 'manage_edit-product_columns', 'haru_columns_into_product_list' );
    }

    // 2.4. Add rows value into Product Page
    if ( ! function_exists( 'haru_column_into_product_list' ) ) {
        function haru_column_into_product_list( $column, $post_id ) {
            switch ( $column ) {
                case 'haru_product_new':
                    echo get_post_meta( $post_id, 'haru_product_new', true );

                    break;

                case 'haru_product_hot':
                    echo get_post_meta( $post_id, 'haru_product_hot', true );

                    break;
            }
        }

        add_action( 'manage_product_posts_custom_column', 'haru_column_into_product_list', 10, 2 );
    }

    // 2.5. Make these columns sortable
    if ( ! function_exists( 'haru_product_sortable_columns' ) ) {
        function haru_product_sortable_columns() {
            return array(
                'haru_product_new' => 'haru_product_new',
                'haru_product_hot' => 'haru_product_hot'
            );
        }

        add_filter( 'manage_edit-product_sortable_columns', 'haru_product_sortable_columns' );
    }

    // 2.6. Order by column
    if ( ! function_exists( 'haru_event_column_orderby' ) ) {
        function haru_event_column_orderby( $query ) {
            if ( ! is_admin() ) return;

            $orderby = $query->get('orderby');
            if ( 'haru_product_new' == $orderby ) {
                $query->set( 'meta_key', 'haru_product_new' );
                $query->set( 'orderby', 'meta_value_num' );
            }

            if ( 'haru_product_hot' == $orderby ) {
                $query->set( 'meta_key', 'haru_product_hot' );
                $query->set( 'orderby', 'meta_value_num' );
            }
        }

        add_action( 'pre_get_posts', 'haru_event_column_orderby' );
    }

    /* 3. Single product filter */
    /* 3.1. Related single product filter */
    if ( ! function_exists( 'haru_related_products_args' ) ) {
        function haru_related_products_args() {
            $related_product_count  = haru_get_option( 'haru_related_product_count', 6 );
            $args['posts_per_page'] = isset( $related_product_count ) ? haru_get_option( 'haru_related_product_count', 6 ) : 6;

            return $args;
        }

        add_filter( 'woocommerce_output_related_products_args', 'haru_related_products_args' );
    }

    /* 3.2. Related single product by category */
    if ( ! function_exists( 'haru_woocommerce_product_related_posts_relate_by_category' ) ) {
        function haru_woocommerce_product_related_posts_relate_by_category() {

            return true;
        }

        add_filter( 'woocommerce_product_related_posts_relate_by_category', 'haru_woocommerce_product_related_posts_relate_by_category' );
    }

    /* 3.3. Related single product by tag */
    if ( ! function_exists( 'haru_woocommerce_product_related_posts_relate_by_tag' ) ) {
        function haru_woocommerce_product_related_posts_relate_by_tag() {

            return true;
        }

        add_filter( 'woocommerce_product_related_posts_relate_by_tag', 'haru_woocommerce_product_related_posts_relate_by_tag' );
    }

    /* 4. Product action (add to cart, compare, wishlist, quickview) */
    /* 4.1. Product Add To Cart */
    add_action( 'haru_woocommerce_product_actions', 'woocommerce_template_loop_add_to_cart', 20 );

    /* 4.2. Product quick view */
    if ( ! function_exists( 'haru_woocomerce_template_loop_quick_view' ) ) {
        function haru_woocomerce_template_loop_quick_view() {
            wc_get_template( 'loop/quick-view.php' );
        }

        add_action( 'haru_woocommerce_product_actions', 'haru_woocomerce_template_loop_quick_view', 25 );
    }

    /* 4.3. Product wishlist */
    if ( defined( 'YITH_WCWL' ) ) {
        if ( ! function_exists( 'haru_woocommerce_return' ) ) {
            function haru_woocommerce_return() {

                return;
            }

            // Remove wishlist single product
            add_filter( 'yith_wcwl_positions', 'haru_woocommerce_return' );
        }

        if ( ! function_exists( 'haru_woocomerce_template_loop_wishlist' ) ) {
            function haru_woocomerce_template_loop_wishlist() {
                wc_get_template( 'loop/wishlist.php' );
            }

            add_action( 'haru_woocommerce_product_actions', 'haru_woocomerce_template_loop_wishlist', 5 ); // Add for loop
            add_action( 'woocommerce_after_add_to_cart_button', 'haru_woocomerce_template_loop_wishlist', 5 ); // Add for single product
        }
    }
    

    /* 4.4. Product compare */
    if ( class_exists( 'YITH_Woocompare' ) ) {
        update_option( 'yith_woocompare_compare_button_in_product_page', 'no' ); // Remove compare single product

        if ( ! function_exists( 'haru_woocomerce_template_loop_compare' ) ) {
            function haru_woocomerce_template_loop_compare() {
                wc_get_template( 'loop/compare.php' );
            }

            add_action( 'haru_woocommerce_product_actions', 'haru_woocomerce_template_loop_compare', 10 ); // Add for loop
            add_action( 'woocommerce_after_add_to_cart_button', 'haru_woocomerce_template_loop_compare', 5 ); // Add for single product
        }
    }

    /* 5. Sale Flash Mode */
    if ( ! function_exists( 'haru_woocommerce_sale_flash' ) ) {
        function haru_woocommerce_sale_flash( $sale_flash, $post, $product ) {
            $product_sale_flash_mode = haru_get_option( 'haru_product_sale_flash_mode', 'percent' );

            if ( $product_sale_flash_mode == 'percent' ) {
                $sale_percent = 0;

                if ( $product->is_on_sale() && $product->get_type() != 'grouped' ) {
                    if ( $product->get_type() == 'variable' ) {
                        return $sale_flash;

                        // Large variations will cause slow loading site
                        $available_variations =  $product->get_available_variations();

                        for ( $i = 0; $i < count( $available_variations ); ++$i ) {
                            $variation_id      = $available_variations[$i]['variation_id'];
                            $variable_product1 = new WC_Product_Variation( $variation_id );
                            $regular_price     = $variable_product1->get_regular_price();
                            $sales_price       = $variable_product1->get_sale_price();
                            $price             = $variable_product1->get_price();

                            if ( $sales_price != $regular_price && $sales_price == $price ) {
                                $percentage= round( ( ( ( $regular_price - $sales_price ) / $regular_price ) * 100 ), 0 ) ;

                                if ( $percentage > $sale_percent ) {
                                    $sale_percent = $percentage;
                                }
                            }
                        }
                    } else {
                        $sale_percent = round( ( ( ( $product->get_regular_price() - $product->get_sale_price() ) / $product->get_regular_price() ) * 100 ), 0 ) ;
                    }
                }

                if ( $sale_percent > 0 ) {
                    return '<span class="product-label__item product-label__item--onsale">-' . $sale_percent . '%</span>';
                } else {
                    return '';
                }
            }

            return $sale_flash;
        }

        add_filter( 'woocommerce_sale_flash', 'haru_woocommerce_sale_flash', 10, 3 );
    }

    /* 6. Remove some default WooCommerce hooks */
    remove_action( 'woocommerce_before_shop_loop_item', 'woocommerce_template_loop_product_link_open', 10 );
    remove_action( 'woocommerce_after_shop_loop_item', 'woocommerce_template_loop_product_link_close', 5 );
    remove_action( 'woocommerce_after_shop_loop_item', 'woocommerce_template_loop_add_to_cart', 10 );

    // For Archive list style (this will show all element hook to woocommerce_template_loop_add_to_cart - CSS to hide )
    add_action( 'woocommerce_after_shop_loop_item_title', 'woocommerce_template_loop_add_to_cart', 20 );

    // Add product short description
    if ( ! function_exists( 'haru_excerpt_in_product_archives' ) ) {
        function haru_excerpt_in_product_archives() {
    ?>
    <div class="product-short-description">
        <?php the_excerpt(); ?>
    </div>
    <?php
        }

        add_action( 'woocommerce_after_shop_loop_item_title', 'haru_excerpt_in_product_archives', 12 );
    }

    /* 7. Haru get search category dropdown */
    if ( ! function_exists( 'haru_categories_binder' ) ) {
        function haru_categories_binder( $categories, $parent, $class = 'product-category-toggle', $is_anchor = false, $show_count = false ) {
            $index  = 0;
            $output = '';

            if ( empty( $categories ) || ! array( $categories ) ) {
                return $output;
            }
            foreach ( $categories as $key => $term ) {
                if ( empty( $term ) || ( ! isset( $term->parent ) ) ) {
                    continue;
                }

                if ( ( (int)$term->parent !== (int)$parent ) || ( $parent === null ) || ( $term->parent === null ) ) {
                    continue;
                }

                if ( $index == 0 ) {
                    $output = '<ul>';

                    if ( $parent == 0 ) {
                        $output = '<ul class="' . esc_attr( $class ) .'">';
                    }
                }

                $output .= '<li>';
                $output .= sprintf('%s%s%s',
                    $is_anchor ? '<a href="' .  esc_url( get_term_link( (int)$term->term_id, 'product_cat' ) ) . '" title="' . esc_attr( $term->name ) . '">' : '<span data-catid="' . esc_attr( $term->term_id ) . '">',
                    $show_count ? esc_html( $term->name . ' (' . $term->count . ')' ) : esc_html( $term->name ),
                    $is_anchor ? '</a>' : '</span>'
                    );
                $output .= haru_categories_binder( $categories, $term->term_id, $class, $is_anchor, $show_count );
                $output .= '</li>';
                $index++;
            }

            if ( ! empty( $output ) ) {
                $output .= '</ul>';
            }

            return $output;
        }
    }

    /* 8. Haru product attribute variation */
    if ( ! function_exists( 'haru_product_attribute_variation' ) ) {
        function haru_product_attribute_variation() {
            global $product;
            // Product attributes
            $product_attribute = haru_get_option( 'haru_product_attribute', 'color' );
            if ( empty( $product_attribute ) || ($product_attribute == 'none' ) ) {
                return;
            }
            $default_attribute  = 'pa_' . $product_attribute;

            $attributes         = maybe_unserialize( get_post_meta( $product->get_id(), '_product_attributes', true ) );
            $product_attributes = $default_attribute;

            if ( ! $attributes ) {
                return;
            }

            $variations = haru_product_get_variations( $product_attributes );

            foreach ( $attributes as $attribute ) {
                if ( $product->get_type() == 'variable' ) {
                    if ( ! $attribute['is_variation'] ) {
                        continue;
                    }
                }

                if ( sanitize_title( $attribute['name'] ) == $product_attributes ) {
                    echo '<div class="haru-variations-list '. $default_attribute .'">';

                    if ( $attribute['is_taxonomy'] ) {
                        $post_terms = wp_get_post_terms( $product->get_id(), $attribute['name'] );
                        $attribute_type = '';
                        $temp_attribute = haru_get_wc_attribute_taxonomy( $attribute['name'] );

                        if ( $temp_attribute ) {
                            $attribute_type = $temp_attribute->attribute_type;
                        }

                        $found = false;
                        foreach ( $post_terms as $term ) {
                            $css_class = '';

                            if ( is_wp_error( $term ) ) {
                                continue;
                            }

                            if ( is_object( $term ) ) {
                                if ( $variations && isset( $variations[$term->slug] ) ) {
                                    $attachment_id = $variations[$term->slug];
                                    $attachment    = wp_get_attachment_image_src( $attachment_id, 'shop_catalog' );
                                    $image_srcset = wp_get_attachment_image_srcset( $attachment_id, 'shop_catalog' );

                                    if ( $attachment_id == get_post_thumbnail_id() && ! $found ) {
                                        $css_class .= ' selected';
                                        $found = true;
                                    }

                                    if ( $attachment ) {
                                        $css_class .= ' haru-variation-image';
                                        $img_src = $attachment[0];
                                        echo haru_variation_html( $term, $attribute_type, $img_src, $css_class, $image_srcset );
                                    }
                                }
                            }
                        }
                    }
                    
                    echo '</div>';
                    break;
                }
            }
        }

        add_action( 'haru_woocommerce_product_variations', 'haru_product_attribute_variation', 5 );
    }

    /* 9. Haru product attribute variation render */
    if ( ! function_exists( 'haru_variation_html' ) ) {
        function haru_variation_html( $term, $attribute_type, $img_src, $css_class, $image_srcset ) {

            $html = '';
            $name = $term->name;

            switch ( $attribute_type ) {
                case 'color':
                    $color  = haru_get_term_meta( $term->term_id, 'product_attribute_color', TRUE );
                    $is_dual_color  = haru_get_term_meta( $term->term_id, 'product_attribute_color_dual', TRUE );
                    $secondary_color  = haru_get_term_meta( $term->term_id, 'product_attribute_color_2', TRUE );

                    if ( $is_dual_color == '1' ) {
                        $style = 'background: linear-gradient(-45deg, ' . $color . ' 0%, ' . $color . ' 50%, ' . $secondary_color . ' 50%, ' . $secondary_color . ' 100%);';
                    } else {
                        list( $r, $g, $b ) = sscanf( $color, "#%02x%02x%02x" );
                        $style = 'background-color:' . $color . ';';
                    }

                    $html = sprintf(
                        '<span class="variation variation-color %s" data-src="%s" data-src-set="%s" title="%s"><span class="color-variation" style="%s;"></span> <span class="haru-tooltip button-tooltip">%s</span></span>',
                        esc_attr( $css_class ),
                        esc_url( $img_src ),
                        esc_attr( $image_srcset ),
                        esc_attr( $name ),
                        esc_attr( $style ),
                        esc_attr( $name )
                    );
                    break;

                case 'image':
                    $image = haru_get_term_meta( $term->term_id, 'product_attribute_image', true );
                    if ( $image ) {
                        $image = wp_get_attachment_image_src( $image );
                        $image = $image ? $image[0] : WC()->plugin_url() . '/assets/images/placeholder.png';
                        $html  = sprintf(
                            '<span class="variation variation-image %s" data-src="%s" data-src-set="%s" title="%s"><img src="%s" alt="%s"><span class="haru-tooltip button-tooltip">%s</span></span>',
                            esc_attr( $css_class ),
                            esc_url( $img_src ),
                            esc_attr( $image_srcset ),
                            esc_attr( $name ),
                            esc_url( $image ),
                            esc_attr( $name ),
                            esc_attr( $name )
                        );
                    }

                    break;

                default:
                    if ( is_object( $term ) ) {
                        $label = get_term_meta( $term->term_id, 'label', true );
                        $label = $label ? $label : $name;
                        $html  = sprintf(
                            '<span class="variation variation-label %s" data-src="%s" data-src-set="%s" title="%s"><span class="haru-tooltip button-tooltip">%s</span>%s</span>',
                            esc_attr( $css_class ),
                            esc_url( $img_src ),
                            esc_attr( $image_srcset ),
                            esc_attr( $name ),
                            esc_attr( $name ),
                            esc_html( $label )
                        );
                    }
                    
                    break;


            }

            return $html;
        }
    }

    // 10
    if ( ! function_exists( 'haru_product_get_variations' ) ) {
        function haru_product_get_variations( $default_attribute ) {
            global $product;

            $variations = array();
            if ( $product->get_type() == 'variable' ) {
                $args = array(
                    'post_parent' => $product->get_id(),
                    'post_type'   => 'product_variation',
                    'orderby'     => 'menu_order',
                    'order'       => 'ASC',
                    'fields'      => 'ids',
                    'post_status' => 'publish',
                    'numberposts' => - 1
                );

                if ( 'yes' === get_option( 'woocommerce_hide_out_of_stock_items' ) ) {
                    $args['meta_query'][] = array(
                        'key'     => '_stock_status',
                        'value'   => 'instock',
                        'compare' => '=',
                    );
                }

                $thumbnail_id = get_post_thumbnail_id();

                $posts = get_posts( $args );

                foreach ( $posts as $post_id ) {
                    $attachment_id = get_post_thumbnail_id( $post_id );
                    $attribute     = haru_get_variation_attributes( $post_id, 'attribute_' . $default_attribute );

                    if ( ! $attachment_id ) {
                        $attachment_id = $thumbnail_id;
                    }

                    if ( $attribute ) {
                        $variations[$attribute[0]] = $attachment_id;
                    }

                }

            }

            return $variations;
        }
    }

    // 11
    if ( ! function_exists( 'haru_get_variation_attributes' ) ) {
        function haru_get_variation_attributes( $child_id, $attribute ) {
            global $wpdb;

            $values = array_unique(
                $wpdb->get_col(
                    $wpdb->prepare(
                        "SELECT meta_value FROM {$wpdb->postmeta} WHERE meta_key = %s AND post_id IN (" . $child_id . ")",
                        $attribute
                    )
                )
            );

            return $values;
        }
    }

    // 12. woocommerce_format_sale_price override
    if ( ! function_exists( 'haru_format_sale_price' ) ) {
        function haru_format_sale_price( $price, $regular_price, $sale_price ) {
            $price = '<ins>' . ( is_numeric( $sale_price ) ? wc_price( $sale_price ) : $sale_price ) . '</ins>' . '<del>' . ( is_numeric( $regular_price ) ? wc_price( $regular_price ) : $regular_price ) . '</del>';
            return $price;
        }

        add_filter( 'woocommerce_format_sale_price', 'haru_format_sale_price', 100, 3 );
    }

    // 13.
    if ( ! function_exists( 'haru_woocommerce_tag_cloud_widget' ) ) {
        function haru_woocommerce_tag_cloud_widget() {
            $args = array(
                'number' => 15,
                'smallest'  => 13, 
                'default'   => 18, 
                'largest'   => 24, 
                'unit'      => 'px',
                'taxonomy' => 'product_tag',
                'format'    => 'flat', 
                'separator' => "", 
                'orderby'   => 'name', 
                'order'     => 'ASC',
                'exclude'   => '', 
                'include'   => '', 
                'link'      => 'view',
            );

            return $args;
        }

        add_filter( 'woocommerce_product_tag_cloud_widget_args', 'haru_woocommerce_tag_cloud_widget' );
    }

    // 14.
    if ( ! function_exists( 'haru_woocommerce_layered_nav_count' ) ) {
        function haru_woocommerce_layered_nav_count( $span_count, $count, $term ) { 
            $span_count = str_replace( array( ')</span>' ), '</span>', $span_count );
            $span_count = str_replace( array( '<span class="count">(' ), '<span class="count">', $span_count );

            return $span_count;
        }; 

        add_filter( 'woocommerce_layered_nav_count', 'haru_woocommerce_layered_nav_count', 10, 3 );
    }

    // 15
    if ( ! function_exists( 'haru_woocommerce_rating_filter_count' ) ) {
        function haru_woocommerce_rating_filter_count( $span_count, $count, $term ) { 
            $span_count = str_replace( array( '(' ), '<span>', $span_count );
            $span_count = str_replace( array( ')' ), '</span>', $span_count );

            return $span_count;
        }; 

        add_filter( 'woocommerce_rating_filter_count', 'haru_woocommerce_rating_filter_count', 10, 3 );
    }
    
    // 16. Clear all filter button
    if ( ! function_exists( 'haru_clear_filters_btn' ) ) {
        function haru_clear_filters_btn() {
            $url                = haru_shop_page_link();
            $_chosen_attributes = WC_Query::get_layered_nav_chosen_attributes();

            $min_price = isset( $_GET['min_price'] ) ? esc_attr( $_GET['min_price'] ) : '';
            $max_price = isset( $_GET['max_price'] ) ? esc_attr( $_GET['max_price'] ) : '';

            if ( 0 < count( $_chosen_attributes ) || $min_price || $max_price ) {
                $reset_url = strtok( $url, '?' );
                if ( isset( $_GET['post_type'] ) ) {
                    $reset_url = add_query_arg( 'post_type', wc_clean( wp_unslash( $_GET['post_type'] ) ), $reset_url );
                }
                ?>
                    <div class="haru-clear-filters">
                        <a href="<?php echo esc_url( $reset_url ); ?>"><?php echo esc_html__( 'Clear filters', 'pricom' ); ?></a>
                    </div>
                <?php
            }
        }

        add_action( 'haru_before_active_filters_widgets', 'haru_clear_filters_btn' );
    }


    // 17. Get base shop page link
    if ( ! function_exists( 'haru_shop_page_link' ) ) {
        function haru_shop_page_link( $keep_query = false, $taxonomy = '' ) {
            // Base Link decided by current page
            $link = '';

            if ( class_exists( 'Automattic\Jetpack\Constants' ) && Automattic\Jetpack\Constants::is_defined( 'SHOP_IS_ON_FRONT' ) ) {
                $link = home_url();
            } elseif ( is_post_type_archive( 'product' ) || is_page( wc_get_page_id( 'shop' ) ) || is_shop() ) {
                $link = get_permalink( wc_get_page_id( 'shop' ) );
            } elseif ( is_product_category() ) {
                $link = get_term_link( get_query_var( 'product_cat' ), 'product_cat' );
            } elseif ( is_product_tag() ) {
                $link = get_term_link( get_query_var( 'product_tag' ), 'product_tag' );
            } elseif ( get_queried_object() ) {
                $queried_object = get_queried_object();

                if ( property_exists( $queried_object, 'taxonomy' ) ) {
                    $link = get_term_link( $queried_object->slug, $queried_object->taxonomy );
                }
            }

            if ( $keep_query ) {

                // Min/Max
                if ( isset( $_GET['min_price'] ) ) {
                    $link = add_query_arg( 'min_price', wc_clean( $_GET['min_price'] ), $link );
                }

                if ( isset( $_GET['max_price'] ) ) {
                    $link = add_query_arg( 'max_price', wc_clean( $_GET['max_price'] ), $link );
                }

                // Orderby
                if ( isset( $_GET['orderby'] ) ) {
                    $link = add_query_arg( 'orderby', wc_clean( $_GET['orderby'] ), $link );
                }

                if ( isset( $_GET['stock_status'] ) ) {
                    $link = add_query_arg( 'stock_status', wc_clean( $_GET['stock_status'] ), $link );
                }

                if ( isset( $_GET['per_row'] ) ) {
                    $link = add_query_arg( 'per_row', wc_clean( $_GET['per_row'] ), $link );
                }

                if ( isset( $_GET['per_page'] ) ) {
                    $link = add_query_arg( 'per_page', wc_clean( $_GET['per_page'] ), $link );
                }

                if ( isset( $_GET['shop_view'] ) ) {
                    $link = add_query_arg( 'shop_view', wc_clean( $_GET['shop_view'] ), $link );
                }

                if ( isset( $_GET['shortcode'] ) ) {
                    $link = add_query_arg( 'shortcode', wc_clean( $_GET['shortcode'] ), $link );
                }

                /**
                 * Search Arg.
                 * To support quote characters, first they are decoded from &quot; entities, then URL encoded.
                 */
                if ( get_search_query() ) {
                    $link = add_query_arg( 's', rawurlencode( wp_specialchars_decode( get_search_query() ) ), $link );
                }

                // Post Type Arg
                if ( isset( $_GET['post_type'] ) ) {
                    $link = add_query_arg( 'post_type', wc_clean( wp_unslash( $_GET['post_type'] ) ), $link );

                    // Prevent post type and page id when pretty permalinks are disabled.
                    if ( is_shop() ) {
                        $link = remove_query_arg( 'page_id', $link );
                    }
                }

                // Min Rating Arg
                if ( isset( $_GET['min_rating'] ) ) {
                    $link = add_query_arg( 'min_rating', wc_clean( $_GET['min_rating'] ), $link );
                }

                // All current filters
                if ( $_chosen_attributes = WC_Query::get_layered_nav_chosen_attributes() ) {
                    foreach ( $_chosen_attributes as $name => $data ) {
                        if ( $name === $taxonomy ) {
                            continue;
                        }
                        $filter_name = sanitize_title( str_replace( 'pa_', '', $name ) );
                        if ( ! empty( $data['terms'] ) ) {
                            $link = add_query_arg( 'filter_' . $filter_name, implode( ',', $data['terms'] ), $link );
                        }
                        if ( 'or' == $data['query_type'] ) {
                            $link = add_query_arg( 'query_type_' . $filter_name, 'or', $link );
                        }
                    }
                }
            }

            $link = apply_filters( 'haru_shop_page_link', $link, $keep_query, $taxonomy );

            if ( is_string( $link ) ) {
                return $link;
            } else {
                return '';
            }
        }
    }

    // 18. Setup loop
    if ( ! function_exists( 'haru_setup_loop' ) ) {
        function haru_setup_loop( $args = array() ) {
            if ( isset( $GLOBALS['haru_loop'] ) ) {
                return; // If the loop has already been setup, bail.
            }

            $default_args = array(
                'product_style'    => haru_get_option( 'haru_archive_product_style', 'style-1' ),
            );

            $GLOBALS['haru_loop'] = wp_parse_args( $args, $default_args );
        }

        add_action( 'woocommerce_before_shop_loop', 'haru_setup_loop', 10 );
        add_action( 'wp', 'haru_setup_loop', 50 );
        add_action( 'loop_start', 'haru_setup_loop', 10 );
    }

    // 19. Set loop prop
    if ( ! function_exists( 'haru_set_loop_prop' ) ) {
        function haru_set_loop_prop( $prop, $value = '' ) {
            if ( ! isset( $GLOBALS['haru_loop'] ) ) {
                haru_setup_loop();
            }

            $GLOBALS['haru_loop'][ $prop ] = $value;
        }
    }

    // 20. Get loop prop
    if ( ! function_exists( 'haru_loop_prop' ) ) {
        function haru_loop_prop( $prop, $default = '' ) {
            haru_setup_loop();

            return isset( $GLOBALS['haru_loop'], $GLOBALS['haru_loop'][ $prop ] ) ? $GLOBALS['haru_loop'][ $prop ] : $default;
        }
    }

    // 21. Reset loop
    if ( ! function_exists( 'haru_reset_loop' ) ) {
        function haru_reset_loop() {
            unset( $GLOBALS['haru_loop'] );
            haru_setup_loop();
        }

        add_action( 'woocommerce_after_shop_loop', 'haru_reset_loop', 1000 );
        add_action( 'loop_end', 'haru_reset_loop', 1000 );
    }

    // 22. Product customize link
    if ( ! function_exists( 'haru_product_customize_link' ) ) {
        function haru_product_customize_link( $product ) {
            if ( function_exists( 'wcdp_add_product_link_customize' ) ) {
                $personalize_product = get_post_meta($product->get_id(),  '_wcdp_personalize_product', true );
                $product_design_id = get_post_meta($product->get_id(),  '_wcdp_product_design_id', true );

                if ( $personalize_product == 'on' && $product_design_id != '' ) {
                    return true;
                }
            }

            return false;
        }
    }

    // 23. Clear variations cache
    if ( ! function_exists( 'haru_clear_variations_cache_save_post' ) ) {
        function haru_clear_variations_cache_save_post( $post_id ) {
            if ( ! apply_filters( 'haru_variations_cache', true ) ) {
                return;
            }

            $transient_name = 'haru_variations_cache_' . $post_id;

            delete_transient( $transient_name );
        }

        add_action( 'save_post', 'haru_clear_variations_cache_save_post' );
    }

    if ( ! function_exists( 'haru_clear_variations_cache_on_product_object_save' ) ) {
        function haru_clear_variations_cache_on_product_object_save( $data ) {
            if ( ! apply_filters( 'haru_variations_cache', true ) ) {
                return;
            }
            $post_id = $data->get_id();
            $transient_name = 'haru_variations_cache_' . $post_id;
            delete_transient( $transient_name );
        }

        add_action( 'woocommerce_after_product_object_save', 'haru_clear_variations_cache_on_product_object_save' );
    }

    // 24. Active variations
    if ( ! function_exists( 'hat_get_active_variations' ) ) {
        function hat_get_active_variations( $attribute_name, $available_variations ) {
            $results = array();

            if ( ! $available_variations ) {
                return $results;
            }

            foreach ( $available_variations as $variation ) {
                $attr_key = 'attribute_' . $attribute_name;
                if ( isset( $variation['attributes'][ $attr_key ] ) ) {
                    $results[] = $variation['attributes'][ $attr_key ];
                }
            }

            return $results;
        }
    }


    // 25. Redirect print your own
    if ( ! function_exists( 'haru_add_to_cart_redirect' ) ) {
        function haru_add_to_cart_redirect( $url ) {
            if ( isset( $_REQUEST['print_your_own'] ) ) {
                $print_your_own_id = absint( $_REQUEST['add-to-cart'] );

                if ( $print_your_own_id ) {
                    $url = wc_get_cart_url();
                }
            }
            
            return $url;
        }

        add_filter( 'woocommerce_add_to_cart_redirect', 'haru_add_to_cart_redirect', 10, 1 );
    }
    
    if ( ! function_exists( 'haru_add_to_cart_message' ) ) {
        function haru_add_to_cart_message( $message, $products ) {
            if ( isset( $_REQUEST['print_your_own'] ) ) {
                return false;
            }

            return $message;
        }

        add_filter( 'wc_add_to_cart_message_html', 'haru_add_to_cart_message', 10, 2 );
    }

    // 26. 
    /**
     * Add classes for widgets.
     *
     * @param  array $params
     * @return array
     */
    if ( ! function_exists( 'haru_add_widget_classes' ) ) {
        function haru_add_widget_classes( $params ) {
            if ( str_contains( $params[0]['widget_id'], 'woocommerce_product_categories' ) ) {
                $params[0] = array_replace( 
                    $params[0], 
                    array(
                        'before_widget' => str_replace( 'widget_product_categories', 'widget_product_categories haru-widget-scroll', $params[0]['before_widget'] )
                    )
                );
            }

            if ( str_contains( $params[0]['widget_id'], 'haru_widget_woo_sorting' ) ) {
                $params[0] = array_replace( 
                    $params[0], 
                    array(
                        'before_widget' => str_replace( 'widget-woo-sorting', 'widget-woo-sorting haru-widget-scroll', $params[0]['before_widget'] )
                    )
                );
            }

            return $params;

        }

        $scroll_for_widget = haru_get_option( 'haru_archive_product_widget_scroll', true );

        if ( $scroll_for_widget == true ) {
            is_admin() || add_filter( 'dynamic_sidebar_params', 'haru_add_widget_classes' );
        }
    }

    // 27.
    if ( ! function_exists( 'haru_product_nav' ) ) {
        function haru_product_nav() {
            $in_same_term = apply_filters( 'haru_get_prev_product_same_term', false );
            $next         = haru_get_next_product( $in_same_term );
            $prev         = haru_get_previous_product( $in_same_term );

            ?>
                <div class="haru-product-nav">
                    <?php if ( $prev ) : ?>
                    <div class="product-nav-btn product-prev">
                        <a href="<?php echo esc_url( $prev->get_permalink() ); ?>"><?php echo esc_html__( 'Prev', 'pricom' ); ?><span class="product-nav-icon"></span></a>
                        <div class="product-nav">
                            <div class="product-nav-image">
                                <a href="<?php echo esc_url( $prev->get_permalink() ); ?>" class="product-nav-thumb">
                                    <?php echo apply_filters( 'haru_product_nav_image', $prev->get_image() ); ?>
                                </a>
                            </div>
                            <div class="product-nav-info">
                                <a href="<?php echo esc_url( $prev->get_permalink() ); ?>" class="product-nav-title">
                                    <?php echo wp_kses_post( $prev->get_title() ); ?>
                                </a>
                                <div class="product-nav-price price">
                                    <?php echo wp_kses_post( $prev->get_price_html() ); ?>
                                </div>
                            </div>
                        </div>
                    </div>
                    <?php endif ?>

                    <a href="<?php echo apply_filters( 'haru_single_product_back_btn_url', get_permalink( wc_get_page_id( 'shop' ) ) ); ?>" class="product-back-btn">
                        <span class="button-tooltip">
                            <?php echo esc_html__( 'Go to Shop', 'pricom' ); ?>
                        </span>
                    </a>

                    <?php if ( $next ) : ?>
                    <div class="product-nav-btn product-next">
                        <a href="<?php echo esc_url( $next->get_permalink() ); ?>"><?php echo esc_html__( 'Next', 'pricom' ); ?><span class="product-nav-icon"></span></a>
                        <div class="product-nav">
                            <div class="product-nav-image">
                                <a href="<?php echo esc_url( $next->get_permalink() ); ?>" class="product-nav-thumb">
                                    <?php echo apply_filters( 'haru_product_nav_image', $next->get_image() ); ?>
                                </a>
                            </div>
                            <div class="product-nav-info">
                                <a href="<?php echo esc_url( $next->get_permalink() ); ?>" class="product-nav-title">
                                    <?php echo wp_kses_post( $next->get_title() ); ?>
                                </a>
                                <div class="product-nav-price price">
                                    <?php echo wp_kses_post( $next->get_price_html() ); ?>
                                </div>
                            </div>
                        </div>
                    </div>
                    <?php endif ?>
                </div>
            <?php
        }
    }

    if ( ! function_exists( 'haru_get_previous_product' ) ) {
        function haru_get_previous_product( $in_same_term = false, $excluded_terms = '', $taxonomy = 'product_cat' ) {
            $product = new HARU\Classes\Haru_Adjacent_Products( $in_same_term, $excluded_terms, $taxonomy, true );

            return $product->get_product();
        }
    }

    if ( ! function_exists( 'haru_get_next_product' ) ) {
        function haru_get_next_product( $in_same_term = false, $excluded_terms = '', $taxonomy = 'product_cat' ) {
            $product = new HARU\Classes\Haru_Adjacent_Products( $in_same_term, $excluded_terms, $taxonomy );

            return $product->get_product();
        }
    }

    if ( ! function_exists( 'haru_cart_count' ) ) {
        function haru_cart_count() {
            if ( ! is_object( WC() ) || ! property_exists( WC(), 'cart' ) || ! method_exists( WC()->cart, 'get_cart_contents_count' ) ) {
                return;
            }

            $count = WC()->cart->get_cart_contents_count();
            ?>
            <span class="haru-cart-number"><?php echo esc_html( $count ); ?> <span><?php echo esc_html( _n( 'item', 'items', $count, 'teespace' ) ); ?></span></span>
            <?php
        }
    }

    if ( ! function_exists( 'haru_cart_subtotal' ) ) {
        function haru_cart_subtotal() {
            if ( ! is_object( WC() ) || ! property_exists( WC(), 'cart' ) || ! method_exists( WC()->cart, 'get_cart_subtotal' ) ) {
                return;
            }

            ?>
                <span class="haru-cart-subtotal"><?php echo WC()->cart->get_cart_subtotal(); ?></span>
            <?php
        }
    }

    if ( ! function_exists( 'haru_cart_data' ) ) {
        function haru_cart_data( $array ) {
            ob_start();
            haru_cart_count();
            $count = ob_get_clean();

            ob_start();
            haru_cart_subtotal();
            $subtotal = ob_get_clean();

            $array['span.haru-cart-number']   = $count;
            $array['span.haru-cart-subtotal'] = $subtotal;

            return $array;
        }

        add_filter( 'woocommerce_add_to_cart_fragments', 'haru_cart_data', 30 );
    }

    // Remove Block Style
    if ( ! function_exists( 'haru_remove_block_styles_woo' ) ) {
        function haru_remove_block_styles_woo() {
            wp_deregister_style( 'wc-blocks-style' );
            wp_dequeue_style( 'wc-blocks-style' );
        }

        add_action( 'enqueue_block_assets', 'haru_remove_block_styles_woo' );
    }
}