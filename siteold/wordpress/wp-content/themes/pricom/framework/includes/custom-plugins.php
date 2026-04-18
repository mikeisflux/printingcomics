<?php
/**
 * @package    HaruTheme/Haru Pricom
 * @version    1.0.0
 * @author     Administrator <admin@harutheme.com>
 * @copyright  Copyright 2022, HaruTheme
*/

// WPC Product Options plugin

if ( true == haru_check_wpc_product_options_plugin_status() ) {
    // Remove plugin filter
    if ( class_exists( 'Wpcpo_Cart' ) ) {
        remove_filter( 'woocommerce_checkout_create_order_line_item', array( Wpcpo_Cart::instance(), 'order_line_item' ) );
        remove_filter( 'woocommerce_get_item_data', array( Wpcpo_Cart::instance(), 'get_item_data' ) );
    }

    // Add custom filter
    if ( ! function_exists( 'haru_order_line_item' ) ) {
        function haru_order_line_item( $item, $cart_item_key, $values ) {
            if ( ! empty( $values['wpcpo-options'] ) ) {
                foreach ( $values['wpcpo-options'] as $option ) {
                    if ( isset( $option['value'] ) && $option['value'] !== '' ) {
                        $option_value = isset( $option['label'] ) && $option['label'] !== '' ? $option['label'] : $option['value'];

                        // Custom by GDragon
                        if ( ( $option['type'] === 'file' ) && ! empty( $option['file_url'] ) ) {
                            $file_name = $option['value'];
                            $option_value = '<a class="box-file" href="' . $option['file_url'] . '" download >' . $file_name . '</a>';
                        }

                        $item->add_meta_data( $option['title'], $option_value );
                    }
                }
            }
        }

        add_filter( 'woocommerce_checkout_create_order_line_item', 'haru_order_line_item', 10, 4 );
    }

    if ( ! function_exists( 'haru_get_item_data' ) ) {
        function haru_get_item_data( $other_data, $cart_item ) {
            if ( ! empty( $cart_item['wpcpo-options'] ) ) {
                foreach ( $cart_item['wpcpo-options'] as $option ) {
                    $data = [
                        'name'    => $option['title'],
                        'value'   => isset( $option['label'] ) && $option['label'] !== '' ? $option['label'] : $option['value'],
                        'display' => '',
                    ];

                    if ( ! empty( $option['type'] ) ) {
                        if ( $option['type'] === 'color-picker' ) {
                            $data['value'] = '<span class="box-color-picker" style="background: ' . $option['value'] . '"></span> ' . $option['value'];
                        }

                        if ( ( $option['type'] === 'image-radio' ) && ! empty( $option['image'] ) ) {
                            $data['value'] = '<span class="box-image-radio">' . wp_get_attachment_image( $option['image'] ) . '</span>';
                        }

                        // Custom by GDragon
                        if ( ( $option['type'] === 'file' ) && ! empty( $option['file_url'] ) ) {
                            $file_name = $data['value'];
                            $data['value'] = '<a class="box-file" href="' . $option['file_url'] . '" download >' . $file_name . '</a>';
                        }
                    }

                    if ( ! empty( $option['display_price'] ) ) {
                        $data['display'] = $data['value'] . ' (' . wc_price( $option['display_price'] ) . ')';
                    }

                    $other_data[] = $data;
                }
            }

            return $other_data;
        }

        add_filter( 'woocommerce_get_item_data', 'haru_get_item_data', 10, 3 );
    }

    // Change size upload limit
    $extra_options_limit = haru_get_option( 'haru_single_product_extra_options_limit', '' );

    if ( $extra_options_limit ) {
        add_filter( 'upload_size_limit', 'haru_upload_size_limit' );

        if ( ! function_exists( 'haru_upload_size_limit' ) ) {
            function haru_upload_size_limit( $bytes ) {
                $extra_options_limit = haru_get_option( 'haru_single_product_extra_options_limit', '' );
                
                return $extra_options_limit * 1024 * 1024;
            }
        }
    }

    // Replace WPC Price by Options button
    if ( class_exists( 'Wpcpo_Frontend' ) ) {
        $Wpcpo = Wpcpo_Frontend::instance();

        remove_filter( 'woocommerce_loop_add_to_cart_link', array( $Wpcpo, 'add_to_cart_link', 10, 2 ) );

        if ( ! function_exists( 'haru_wpcpo_required_link' ) ) {
            function haru_wpcpo_required_link( $link, $product ) {
                global $product;

                $Wpcpo = Wpcpo_Frontend::instance();

                if ( ( $fields = $Wpcpo::get_required_fields( $product ) ) && ! empty( $fields ) ) {
                    $link = sprintf(
                        '<div class="product-button product-button--add-to-cart">
                            <a href="%s" class="btn_add_to_cart">
                                <span class="haru-tooltip button-tooltip">%s</span>
                            </a>
                        </div>',
                        esc_url( $product->get_permalink() ),
                        esc_html__( 'Select options', 'pricom' )
                    );
                }

                return $link;
            }

            add_filter( 'woocommerce_loop_add_to_cart_link', 'haru_wpcpo_required_link', 10, 2 );
        }
    }
}
