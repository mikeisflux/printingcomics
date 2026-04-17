/**
 * @package    HaruTheme
 * @version    1.0.0
 * @author     Administrator <admin@harutheme.com>
 * @copyright  Copyright 2022, HaruTheme
 */

(function($){
    "use strict";
    var HaruAdmin = {
        initialize: function() {
            HaruAdmin.addCustomSidebar();
            HaruAdmin.cmb2_box_show_hide();
        },
        addCustomSidebar: function() {
            var add_sidebar_form = $('#haru-form-add-sidebar');

            if ( add_sidebar_form.length > 0 ) {
                var add_sidebar_form_new = add_sidebar_form.clone();

                add_sidebar_form.remove();
                $('#widgets-right').append('<div class="wp-clearfix"></div>');
                add_sidebar_form = $('#widgets-right').append(add_sidebar_form_new);
                
                $('#haru-add-sidebar').on('click', function(e) {
                    e.preventDefault();
                    var sidebar_name = $.trim( $(this).siblings('#sidebar_name').val() );
                    if ( sidebar_name != '' ) {
                        $(this).attr('disabled', true);
                        var data = {
                            action: 'haru_add_custom_sidebar',
                            sidebar_name: sidebar_name
                        };
                        
                        $.ajax({
                            type : 'POST',
                            url : ajaxurl,
                            data : data,
                            success : function(response) {
                                window.location.reload(true);
                            }
                        });
                    }
                });
            }
            
            if ( $('.sidebar-haru-custom-sidebar').length > 0 ) {
                var delete_button = '<span class="delete-sidebar dashicons-before dashicons-trash"></span>';
                $('.sidebar-haru-custom-sidebar .sidebar-name').prepend(delete_button);
                
                $('.sidebar-haru-custom-sidebar .delete-sidebar').on('click', function() {
                    var sidebar_name = $(this).parent().find('h2').text();
                    var widget_block = $(this).parents('.widgets-holder-wrap');
                    var ok = confirm('Do you want to delete this sidebar?');
                    if ( ok ) {
                        widget_block.hide();
                        var data = {
                            action: 'haru_delete_custom_sidebar',
                            sidebar_name: sidebar_name
                        };
                        
                        $.ajax({
                            type : 'POST',
                            url : ajaxurl,
                            data : data,
                            success : function(response) {
                                if ( response != '' ) {
                                    widget_block.remove();
                                } else {
                                    widget_block.show();
                                    alert('Cant delete the sidebar. Please try again!');
                                }
                            }
                        });
                    }
                });
            }
        },
        cmb2_box_show_hide: function() {
            var prefix  = 'haru_';

            // Classic Editor
            if ( $('#post').length > 0 ) {
                var cmb2_post_format = $('[id^="'+ prefix +'post_metabox_"]').hide();

                setTimeout(function(){
                    var current_format = $("#post-formats-select").find('input[type=radio]:checked').val();

                    if ( current_format != 'standard' ) {
                        $('#' + prefix +  'post_metabox_' + current_format).show();
                    }

                    $("#post-formats-select").find('input[type=radio]').on('change', function() {
                        var new_format = $(this).val();

                        cmb2_post_format.hide();
                        $('#' + prefix +  'post_metabox_' + new_format).show();
                    })
                }, 100);
            } else {
                // Gutenberg
                if ( HaruAdmin.isGutenbergActive() ) {
                    wp.data.subscribe(function(){
                        var cmb2_post_format = $('[id^="'+ prefix +'post_metabox_"]').hide();
                        var current_format = wp.data.select( 'core/editor' ).getEditedPostAttribute( 'format' );

                        if ( current_format != 'standard' ) {
                            $('#' + prefix +  'post_metabox_' + current_format).show();
                        }
                    });
                }
                
            }
        },
        isGutenbergActive() {
            var cList = document.body.classList;

            return cList.contains( 'block-editor-page' ) && cList.contains( 'post-type-post' );
        }
    };

    $(document).ready(function(){
        HaruAdmin.initialize();
    });
    
})(jQuery);