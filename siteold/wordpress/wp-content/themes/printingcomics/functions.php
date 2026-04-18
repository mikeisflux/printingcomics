<?php

add_action( 'wp_enqueue_scripts', 'printingcomics_enqueue_styles' );
function printingcomics_enqueue_styles() {
	wp_enqueue_style( 'printingcomics-style', get_stylesheet_directory_uri() . '/style.css', array('haru-theme-style') ); 
	wp_enqueue_script(
        'custom-script',
        get_stylesheet_directory_uri() . '/assets/js/haru-custom-script.js',
        array( 'jquery' )
    );
}

//add_action('admin_head', 'admin_custom_css');
function admin_custom_css() {
  echo '<style>
	.notice.notice-error, .mabel-wapf-license {
    	display: none !important;
	}
  </style>';
}

// 1. Single Product Page
// add_filter( 'woocommerce_quantity_input_min', 'printingcomics_woocommerce_quantity_min_25_item', 9999, 2 );
// function printingcomics_woocommerce_quantity_min_25_item( $min, $product ) {  
//    if ( is_product() ) {
//       if ( 57 === $product->get_id() || 64 === $product->get_id() || 18953 === $product->get_id() ) {
//          $min = 25;
//       }
//    }
//    return $min;
// }
 
// ------------
// 2. Cart Page
// add_filter( 'woocommerce_cart_item_quantity', 'printingcomics_woocommerce_quantity_min_25_items_cart', 9999, 3 );
// function printingcomics_woocommerce_quantity_min_25_items_cart( $product_quantity, $cart_item_key, $cart_item ) {  
//    $_product = apply_filters( 'woocommerce_cart_item_product', $cart_item['data'], $cart_item, $cart_item_key );
//    $min = 1;
//    if ( 57 === $_product->get_id() || 64 === $_product->get_id() || 18953 === $_product->get_id() ) {
//       $min = 25;
//    }
    
//    $product_quantity = woocommerce_quantity_input( array(
//       'input_name'   => "cart[{$cart_item_key}][qty]",
//       'input_value'  => $cart_item['quantity'],
//       'max_value'    => $_product->get_max_purchase_quantity(),
//       'min_value'    => $min,
//       'product_name' => $_product->get_name(),
//    ), $_product, false ); 
//    return $product_quantity;
// }

add_action( 'woocommerce_before_add_to_cart_quantity', 'printingcomics_echo_qty_front_add_cart' );
function printingcomics_echo_qty_front_add_cart() {
   global $product;
   if ( 64 === $product->get_id() ) {
   echo '<div id="SpineWidthCal"></div>';
   }
   if ( $product->get_min_purchase_quantity() == $product->get_max_purchase_quantity() ) return;
   echo '<div class="qtytitle">Quantity: </div>'; 
}

add_action( 'woocommerce_after_add_to_cart_button', 'add_content_after_addtocart_button_func' );
function add_content_after_addtocart_button_func() { ?>
   <div class="fullfill-link"><a target="_blank" href="/fulfillment/">Fulfilment Services</a></div>
   <div class="discountnotice"><p>If QTY is over 50 a discount will be added after you ADD TO CART</p></div>
<?php }

add_action( 'woocommerce_before_single_product', 'printingcomics_remove_single_product_price' );
function printingcomics_remove_single_product_price() {
   remove_action( 'woocommerce_single_product_summary', 'woocommerce_template_single_price', 10 );
}

add_filter( 'woocommerce_variable_sale_price_html', 'printingcomics_remove_prices', 9999, 2 );
 
add_filter( 'woocommerce_variable_price_html', 'printingcomics_remove_prices', 9999, 2 );
 
add_filter( 'woocommerce_get_price_html', 'printingcomics_remove_prices', 9999, 2 );
function printingcomics_remove_prices( $price, $product ) {
   if ( ! is_admin() ) $price = '';
   return $price;
}


add_filter('woocommerce_variable_price_html','custom_from',10);
add_filter('woocommerce_grouped_price_html','custom_from',10);
add_filter('woocommerce_variable_sale_price_html','custom_from',10);
function custom_from($price){
    return false;
}


function printingcomics_add_script_footer(){
   global $product; ?>
   <script type="text/javascript">
         jQuery(document).ready(function($){
            $('.wpcpo-total').empty();
            $('dl.variation .woocommerce-Price-amount.amount').empty();

            jQuery( document.body ).on( 'added_to_cart', function($){
               setTimeout(function(){
                  $('dl.variation .woocommerce-Price-amount.amount').empty();
               }, 500);
            });

            jQuery('.haru-cart-icon').on('click', function(){
               $('dl.variation .woocommerce-Price-amount.amount').empty();
               jQuery('dl.variation dd p').each(function() {
                  var text = jQuery(this).text();
                  jQuery(this).html(text.replace('(', '').replace(')', ''));
               });
            });

            jQuery('dl.variation dd p').each(function() {
               var text = jQuery(this).text();
               //text = text.slice(0, -1);
               jQuery(this).html(text.replace('(', '').replace(')', ''));
               // jQuery(this.previousSibling).slice(0, -1);
               // jQuery(this).next().remove(')');
            });

         });

         

   </script>
   <?php
   if ( is_product() ) { 
      if ( 19148 == $product->get_id() ) { ?>

         <script type="text/javascript">
            jQuery(document).ready(function($){

               $("select[data-title='Interior Page Count'] ").on("change", function() {
                  var pagecount = jQuery('select[data-title="Interior Page Count"] option:selected').val();
                  $('#pa_interior-page-count').val('12-interior-page-numbers-4-cover-pages').trigger('change');
               });
            
            });
         </script>
      <?php }
      
      if ( 64 == $product->get_id() ) {
         ?>
         <script type="text/javascript">
            jQuery(document).ready(function($){

               var pagecount = jQuery('select[data-title="Interior Page Count"] option:selected').val();
               var spinwidth = parseInt(pagecount) * 0.0025;
               spinwidth = spinwidth / 1.08;
               $('#SpineWidthCal').html('<label>Spine width:</label> ' + spinwidth.toFixed(3)  + '"');
               console.log(pagecount);
               

               // var npageprice = jQuery('select[data-title="Interior Page Count"] option:selected').attr("data-price");
               // var rushprice = npageprice * 0.35;
               // var lightningprice = npageprice * 0.55;
               // $('select[data-title="Choose your production speed"] option[data-label="Rush (7-13 Business Days)"]').attr("data-price",rushprice);
               // $('select[data-title="Choose your production speed"] option[data-label="Lightning (2-6 Business Days)"]').attr("data-price",lightningprice);


               // var blacknwhitecalc = -(pagecount * 0.03);
               // $('select[data-title="Interiors"] option[data-label="Black & White"]').attr("data-price",blacknwhitecalc);

               // $("select[data-title='Interior Page Count'] ").on("change", function() {
               //    pagecount = jQuery('select[data-title="Interior Page Count"]  option:selected').val();
               //    var spinwidth = parseInt(pagecount) * 0.0025;
               //    spinwidth = spinwidth / 1.08;
               //    $('#SpineWidthCal').html('<label>Spine width:</label> ' + spinwidth.toFixed(3) + '"');

               //    npageprice = jQuery('select[data-title="Interior Page Count"] option:selected').attr("data-price");
               //    var rushprice = npageprice * 0.35;
               //    var lightningprice = npageprice * 0.55;
               //    console.log(rushprice);
               //    console.log(lightningprice);
               //    $('select[data-title="Choose your production speed"] option[data-label="Rush (7-13 Business Days)"]').attr("data-price",rushprice);
               //    $('select[data-title="Choose your production speed"] option[data-label="Lightning (2-6 Business Days)"]').attr("data-price",lightningprice);

               //    var blacknwhitecalc = -(pagecount * 0.03);
               //    $('select[data-title="Interiors"] option[data-label="Black & White"]').attr("data-price",blacknwhitecalc);

               // });
            });
         </script>
         <?php
      }
   }
}
add_action('wp_footer', 'printingcomics_add_script_footer');

function add_text_forgot_pass(){
	if (isset($_GET["password-protected"])) {
		echo '<h4>If you dont have password please submit the form below we will send you the password to access our site.</h4>';
		echo do_shortcode('[wpforms id="19708" title="true"]');
	}
}
add_action('login_footer', 'add_text_forgot_pass');

function password_protected_page_code() { 
?> 
<style type="text/css"> 
body.login div#login h1 a {
 background-image: url(https://printingcomics.com/wp-content/uploads/2022/02/printing-comics.png);
	width: 80%;
	background-size: 100%;
	height: auto;
}
.login-password-protected h4{text-align: center;}
#wpforms-19708 {max-width: 500px;margin: 0 auto;}
.wpforms-confirmation-container{text-align:center;}
label.wpforms-field-label.wpforms-label-hide, .wpforms-hidden {display: none;}
.login form .input, .login input[type=email], .login input[type=text], .login input[type=tel], .login textarea {
    font-size: 16px;
    line-height: 1.33333333;
    width: 100%;
    border-width: .0625rem;
    padding: .1875rem .3125rem;
    margin: 0 6px 16px 0;
    min-height: 40px;
    max-height: none;
}
.login-password-protected button, .login-password-protected [type="button"], .login-password-protected [type="reset"], .login-password-protected [type="submit"] {
    background-color: #dd1d26;
    display: inline-block;
    color: #fff;
    fill: #fff;
    height: 38px;
    line-height: 38px;
    border: none;
    border-radius: 5px;
    padding: 0 35px;
    font-weight: 600;
    text-align: center;
    transition: all .3s;
}
.login-password-protected .wpforms-title {
    font-size: 20px;
    text-align: center;
    font-weight: bold;
    margin-bottom: 20px;
}
</style>
<?php } add_action( 'login_enqueue_scripts', 'password_protected_page_code' );


