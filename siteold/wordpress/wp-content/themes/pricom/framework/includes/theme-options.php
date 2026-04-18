<?php

/**
 * ReduxFramework Sample Config File
 * For full documentation, please visit: http://docs.reduxframework.com/
 */

if ( ! class_exists( 'Redux_Framework_theme_options' ) ) {

    class Redux_Framework_theme_options {

        public $args = array();
        public $sections = array();
        public $theme;
        public $ReduxFramework;

        public function __construct() {
            if ( ! class_exists( 'HaruReduxFramework' ) ) {
                return;
            }

            $this->initSettings();
        }

        public function initSettings() {
            // Set the default arguments
            $this->setArguments();

            // Set a few help tabs so you can see how it's done
            $this->setHelpTabs();

            // Create the sections and fields
            $this->setSections();

            // If Redux is running as a plugin, this will remove the demo notice and links
            add_action( 'init', array( $this, 'remove_demo' ) );

            if ( ! isset( $this->args['opt_name'] ) ) { // No errors please
                return;
            }

            $this->ReduxFramework = new HaruReduxFramework( $this->sections, $this->args );
        }

        /**
         * Filter hook for filtering the args. Good for child themes to override or add to the args array. Can also be used in other functions.
         * */
        function change_arguments( $args ) {
            $args['dev_mode'] = false;

            return $args;
        }

        /**
         * Filter hook for filtering the default value of any given field. Very useful in development mode.
         * */
        function change_defaults( $defaults ) {
            $defaults['str_replace'] = 'Testing filter hook!';

            return $defaults;
        }

        // Remove the demo link and the notice of integrated demo from the redux-framework plugin
        function remove_demo() {
            // Used to hide the demo mode link from the plugin page. Only used when Redux is a plugin.
            if ( class_exists( 'ReduxFrameworkPlugin' ) ) {
                // Used to hide the activation notice informing users of the demo panel. Only used when Redux is a plugin.
                remove_action( 'admin_notices', array( ReduxFrameworkPlugin::instance(), 'admin_notices' ) );
            }
        }

        public function setSections() {
            // General Setting
            $this->sections[] = array(
                'title'  => esc_html__( 'General Setting', 'pricom' ),
                'desc'   => esc_html__( 'Welcome to Haru Pricom theme options panel! You can easy to customize the theme for your purpose! Please note some settings in here can be override by settings in Page Metabox of each page.', 'pricom' ),
                'icon'   => 'el el-cog',
                'fields' => array(
                    array(
                        'id'       => 'haru_layout_style',
                        'type'     => 'image_select',
                        'title'    => esc_html__( 'Layout Style', 'pricom' ),
                        'subtitle' => '',
                        'desc'     => '',
                        'options'  => array(
                            'wide'  => array(
                                'title' => esc_html__( 'Wide', 'pricom' ), 
                                'img' => get_template_directory_uri().'/framework/admin-assets/images/theme-options/layout-wide.png'
                            ),
                            'boxed' => array(
                                'title' => esc_html__( 'Boxed', 'pricom' ), 
                                'img' => get_template_directory_uri().'/framework/admin-assets/images/theme-options/layout-boxed.png'
                            ),
                            'float' => array(
                                'title' => esc_html__( 'Float', 'pricom' ), 
                                'img' => get_template_directory_uri().'/framework/admin-assets/images/theme-options/layout-float.png'
                            )
                        ),
                        'default'  => 'wide'
                    ),

                    array(
                        'id'       => 'haru_layout_site_max_width',
                        'type'     => 'slider',
                        'title'    => esc_html__( 'Site Max Width (px)', 'pricom' ),
                        'subtitle' => esc_html__( 'Set the site max width of body', 'pricom' ),
                        'default'  => '1200',
                        "min"      => 980,
                        "step"     => 10,
                        "max"      => 1600,
                        'required' => array('haru_layout_style','=','boxed'),
                    ),

                    array(
                        'id'       => 'haru_body_background_mode',
                        'type'     => 'button_set',
                        'title'    => esc_html__( 'Body Background Mode', 'pricom' ),
                        'subtitle' => esc_html__( 'Chose Background Mode', 'pricom' ),
                        'desc'     => '',
                        'options'  => array(
                            'background' => esc_html__( 'Background', 'pricom' ),
                            'pattern'    => esc_html__( 'Pattern', 'pricom' )
                        ),
                        'default'  => 'background',
                        'required' => array('haru_layout_style','=','boxed'),
                    ),

                    array(
                        'id'       => 'haru_body_background',
                        'type'     => 'background',
                        'output'   => array( 'body' ),
                        'title'    => esc_html__( 'Body Background', 'pricom' ),
                        'subtitle' => esc_html__( 'Body background (Use only for Boxed layout style).', 'pricom' ),
                        'default'  => array(
                            'background-color'      => '',
                            'background-repeat'     => 'no-repeat',
                            'background-position'   => 'center center',
                            'background-attachment' => 'fixed',
                            'background-size'       => 'cover'
                        ),
                        'required'  => array(
                            array('haru_body_background_mode', '=', array( 'background' ))
                        ),
                    ),

                    array(
                        'id'       => 'haru_body_background_pattern',
                        'type'     => 'image_select',
                        'title'    => esc_html__( 'Background Pattern', 'pricom' ),
                        'subtitle' => esc_html__( 'Body background pattern (Use only for Boxed layout style)', 'pricom' ),
                        'desc'     => '',
                        'height'   => '40px',
                        'options'  => array(
                            'pattern-1.png' => array('title' => '', 'img' => get_template_directory_uri().'/framework/admin-assets/images/theme-options/pattern-1.png'),
                            'pattern-2.png' => array('title' => '', 'img' => get_template_directory_uri().'/framework/admin-assets/images/theme-options/pattern-2.png'),
                            'pattern-3.png' => array('title' => '', 'img' => get_template_directory_uri().'/framework/admin-assets/images/theme-options/pattern-3.png'),
                            'pattern-4.png' => array('title' => '', 'img' => get_template_directory_uri().'/framework/admin-assets/images/theme-options/pattern-4.png'),
                            'pattern-5.png' => array('title' => '', 'img' => get_template_directory_uri().'/framework/admin-assets/images/theme-options/pattern-5.png'),
                            'pattern-6.png' => array('title' => '', 'img' => get_template_directory_uri().'/framework/admin-assets/images/theme-options/pattern-6.png'),
                            'pattern-7.png' => array('title' => '', 'img' => get_template_directory_uri().'/framework/admin-assets/images/theme-options/pattern-7.png'),
                            'pattern-8.png' => array('title' => '', 'img' => get_template_directory_uri().'/framework/admin-assets/images/theme-options/pattern-8.png'),
                            'pattern-9.png' => array('title' => '', 'img' => get_template_directory_uri().'/framework/admin-assets/images/theme-options/pattern-9.png'),
                            'pattern-10.png' => array('title' => '', 'img' => get_template_directory_uri().'/framework/admin-assets/images/theme-options/pattern-10.png'),
                        ),
                        'default'  => 'pattern-1.png',
                        'required' => array(
                            array('haru_body_background_mode', '=', array('pattern'))
                        ) ,
                    ),
                    
                    array(
                        'id'       => 'haru_home_preloader',
                        'type'     => 'select',
                        'title'    => esc_html__( 'Page Preloader', 'pricom' ),
                        'subtitle' => esc_html__( 'Please leave empty if you don\'t want to use this!', 'pricom' ),
                        'desc'     => '',
                        'options'  => array(
                            'square-1'   => esc_html__('Square 01', 'pricom' ),
                            'square-2'   => esc_html__('Square 02', 'pricom' ),
                            'square-3'   => esc_html__('Square 03', 'pricom' ),
                            'square-4'   => esc_html__('Square 04', 'pricom' ),
                            'square-5'   => esc_html__('Square 05', 'pricom' ),
                            'square-6'   => esc_html__('Square 06', 'pricom' ),
                            'square-7'   => esc_html__('Square 07', 'pricom' ),
                            'square-8'   => esc_html__('Square 08', 'pricom' ),
                            'square-9'   => esc_html__('Square 09', 'pricom' ),
                            'round-1'    => esc_html__('Round 01', 'pricom' ),
                            'round-2'    => esc_html__('Round 02', 'pricom' ),
                            'round-3'    => esc_html__('Round 03', 'pricom' ),
                            'round-4'    => esc_html__('Round 04', 'pricom' ),
                            'round-5'    => esc_html__('Round 05', 'pricom' ),
                            'round-6'    => esc_html__('Round 06', 'pricom' ),
                            'round-7'    => esc_html__('Round 07', 'pricom' ),
                            'round-8'    => esc_html__('Round 08', 'pricom' ),
                            'round-9'    => esc_html__('Round 09', 'pricom' ),
                        ),
                        'default' => ''
                    ),

                    array(
                        'id'       => 'haru_home_preloader_bg_color',
                        'type'     => 'color_rgba',
                        'title'    => esc_html__( 'Preloader background color', 'pricom' ),
                        'subtitle' => '',
                        'default'  => array(),
                        'mode'     => 'background',
                        'validate' => 'colorrgba',
                        'required' => array('haru_home_preloader', 'not_empty_and', array('none')),
                    ),

                    array(
                        'id'       => 'haru_home_preloader_spinner_color',
                        'type'     => 'color',
                        'title'    => esc_html__( 'Preloader spinner color', 'pricom' ),
                        'subtitle' => '',
                        'default'  => '#e8e8e8',
                        'validate' => 'color',
                        'required' => array( 'haru_home_preloader', 'not_empty_and', array('none') ),
                    ),

                    array(
                        'id'       => 'haru_back_to_top',
                        'type'     => 'switch',
                        'title'    => esc_html__( 'Back To Top', 'pricom' ),
                        'subtitle' => '',
                        'default'  => true
                    ),

                    // Custom CSS & Script
                    array(
                        'id'       => 'haru_custom_js',
                        'type'     => 'ace_editor',
                        'mode'     => 'javascript',
                        'theme'    => 'monokai',
                        'title'    => esc_html__('Custom JS', 'pricom'),
                        'subtitle' => esc_html__('Insert your Javscript code here. You can add your Google Analytics Code here. Please do not place any <script> tags in here! From WordPress version 4.7+ you can add Custom CSS in Appearance » Customize » Additional CSS.', 'pricom'),
                        'desc'     => '',
                        'default'  => '',
                        'options'  => array( 'minLines'=> 10, 'maxLines' => 60 )
                    ),
                )
            );

            // Header
            $this->sections[] = array(
                'title'  => esc_html__( 'Header', 'pricom' ),
                'desc'   => '',
                'icon'   => 'el el-credit-card',
                'fields' => array(
                    array(
                        'id'       => 'haru_header',
                        'type'     => 'header',
                        'title'    => esc_html__( 'Header Builder Type', 'pricom' ),
                        'subtitle' => esc_html__('Please go to Header Builder to create Header.', 'pricom'),
                        'desc'     => esc_html__( 'This option can be override by Page Metabox -> Header of each page.', 'pricom' ),
                    ),
                    array(
                        'id'       => 'haru_header_transparent',
                        'type'     => 'switch',
                        'title'    => esc_html__( 'Header Transparent', 'pricom' ),
                        'desc'     => esc_html__( 'This option can be override by Page Metabox -> Header of each page.', 'pricom' ),
                        'default'  => '0',
                    ),
                    array(
                        'id'       => 'haru_header_transparent_skin',
                        'type'     => 'button_set',
                        'title'    => esc_html__( 'Header Transparent Skin', 'pricom' ),
                        'desc'     => esc_html__( 'This option can be override by Page Metabox -> Header of each page.', 'pricom' ),
                        'options'  => array(
                            'light' => esc_html__( 'Light', 'pricom' ),
                            'dark'  => esc_html__( 'Dark', 'pricom' ),
                        ),
                        'default'  => 'light',
                        'required' => array( 'haru_header_transparent', '=', array( '1' ) ),
                    ),
                    array(
                        'id'       => 'haru_header_sticky',
                        'type'     => 'switch',
                        'title'    => esc_html__( 'Header Sticky', 'pricom' ),
                        'desc'     => esc_html__( 'This option can be override by Page Metabox -> Header of each page.', 'pricom' ),
                        'default'  => '1',
                    ),
                    array(
                        'id'       => 'haru_header_sticky_element',
                        'type'     => 'button_set',
                        'title'    => esc_html__( 'Header Sticky Element', 'pricom' ),
                        'desc'     => esc_html__( 'You can choose sticky Header or only Menu (section include Haru Nav Menu widget in Elementor).', 'pricom' ),
                        'options'  => array(
                            'header' => esc_html__( 'Header', 'pricom' ),
                            'menu'  => esc_html__( 'Menu', 'pricom' ),
                        ),
                        'default'  => 'header',
                        'required' => array( 'haru_header_sticky', '=', array( '1' ) ),
                    ),
                )
            );
            

            // Footer
            $this->sections[] = array(
                'title'  => esc_html__( 'Footer', 'pricom' ),
                'desc'   => '',
                'icon'   => 'el el-lines',
                'fields' => array(
                    array(
                        'id'       => 'haru_footer',
                        'type'     => 'footer',
                        'title'    => esc_html__('Footer Builder Type', 'pricom'),
                        'subtitle' => esc_html__('Please go to Footer Builder to create Footer.', 'pricom'),
                        'desc'     => esc_html__( 'This option can be override by Page Metabox -> Footer of each page.', 'pricom' ),
                    ),

                )
            );

            // Logo
            $this->sections[] = array(
                'title'  => esc_html__( 'Logo & Favicon', 'pricom' ),
                'desc'   => '',
                'icon'   => 'el el-picture',
                'fields' => array(
                    array(
                        'id'    => 'haru_logo',
                        'type'  => 'info',
                        'style' => 'success',
                        'title' => esc_html__( 'Logo', 'pricom' ),
                        'icon'  => 'el el-info-circle',
                        'desc'  => esc_html__( 'Please go to Header Builder & Footer Builder to manage site Logo. You need to activate Haru Pricom plugin to see Header Builder & Footer Builder.', 'pricom')
                    ),
                    array(
                        'id'       => 'haru_custom_favicon',
                        'type'     => 'media',
                        'url'      => true,
                        'title'    => esc_html__( 'Custom favicon', 'pricom'),
                        'subtitle' => esc_html__( 'Upload a 16px x 16px Png/Gif/ico image.', 'pricom' ),
                        'desc'     => ''
                    ),
                )
            );

            // Appearance
            $this->sections[] = array(
                'title'      => esc_html__( 'Appearance', 'pricom' ),
                'desc'       => esc_html__( 'If you want to change Color Scheme or Typography you must turn ON SCSS Compiler.', 'pricom' ),
                'icon'       => 'el el-edit',
                'fields' => array(
                    array(
                        'id'       => 'haru_scss_compiler',
                        'type'     => 'switch',
                        'title'    => esc_html__( 'SCSS Compiler', 'pricom' ),
                        'subtitle' => esc_html__( 'To make this option work you need make sure PHP settings as Theme Requirement.', 'pricom' ),
                        'default'  => '0',
                    ),

                )
            );

            // Styling Options
            $this->sections[] = array(
                'title'  => esc_html__( 'Color Scheme', 'pricom' ),
                'desc'   => esc_html__( 'To make sure Typograhpy works you need enable SCSS Compiler and Save Changes 2 times to Regenerate Custom CSS file.', 'pricom' ),
                'icon'   => 'el el-magic',
                'subsection' => true,
                'fields' => array(
                    array(
                        'id'     => 'haru_section_color_light',
                        'type'   => 'section',
                        'title'  => esc_html__( 'Light Mode', 'pricom' ),
                        'indent' => true
                    ),
                    array(
                        'id'       => 'haru_primary_color',
                        'type'     => 'color',
                        'title'    => esc_html__( 'Primary Color', 'pricom' ),
                        'subtitle' => esc_html__( 'Set Primary Color', 'pricom' ),
                        'compiler' => true,
                        'default'  => '#dd1d26',
                        'validate' => 'color',
                    ),
                    array(
                        'id'       => 'haru_text_color',
                        'type'     => 'color',
                        'title'    => esc_html__( 'Text Color', 'pricom' ),
                        'subtitle' => esc_html__( 'Set Text Color.', 'pricom' ),
                        'compiler' => true,
                        'default'  => '#7e7e7e',
                        'validate' => 'color',
                    ),
                    array(
                        'id'       => 'haru_text_color_secondary',
                        'type'     => 'color',
                        'title'    => esc_html__( 'Text Color Secondary', 'pricom' ),
                        'subtitle' => esc_html__( 'Set Text Color Secondary.', 'pricom' ),
                        'compiler' => true,
                        'default'  => '#9b9b9b',
                        'validate' => 'color',
                    ),
                    array(
                        'id'       => 'haru_text_color_tertiary',
                        'type'     => 'color',
                        'title'    => esc_html__( 'Text Color Tertiary', 'pricom' ),
                        'subtitle' => esc_html__( 'Set Text Color Tertiary.', 'pricom' ),
                        'compiler' => true,
                        'default'  => '#ababab',
                        'validate' => 'color',
                    ),
                    array(
                        'id'       => 'haru_heading_color',
                        'type'     => 'color',
                        'title'    => esc_html__( 'Heading Color', 'pricom' ),
                        'subtitle' => esc_html__( 'Set Heading Color.', 'pricom' ),
                        'default'  => '#000000',
                        'compiler' => true,
                        'validate' => 'color',
                    ),
                    array(
                        'id'       => 'haru_link_color',
                        'type'     => 'link_color',
                        'title'    => esc_html__( 'Link Color', 'pricom' ),
                        'subtitle' => esc_html__( 'Set Link Color.', 'pricom' ),
                        'compiler' => true,
                        'default'  => array(
                            'regular'  => '#7e7e7e',
                            'hover'    => '#dd1d26',
                            'active'   => '#dd1d26',
                        ),
                    ),
                    array(
                        'id'     => 'haru_section_color_gradient',
                        'type'   => 'section',
                        'title'  => esc_html__( 'Gradient Color', 'pricom' ),
                        'subtitle' => esc_html__( 'Because gradient have many colors, Currently you can set Background Gradient of Icon Box or Element have background gradient. With Container of Elementor you can change manually by setttings.', 'pricom' ),
                        'indent' => true
                    ),
                    array(
                        'id'       => 'haru_gradient_color_1',
                        'type'     => 'color',
                        'title'    => esc_html__( 'Gradient Color 1', 'pricom' ),
                        'subtitle' => esc_html__( 'Set Gradient Color 1.', 'pricom' ),
                        'compiler' => true,
                        'default'  => '#ff869f',
                        'validate' => 'color',
                    ),
                    array(
                        'id'       => 'haru_gradient_color_2',
                        'type'     => 'color',
                        'title'    => esc_html__( 'Gradient Color 2', 'pricom' ),
                        'subtitle' => esc_html__( 'Set Gradient Color 2.', 'pricom' ),
                        'compiler' => true,
                        'default'  => '#fa988a',
                        'validate' => 'color',
                    ),
                    array(
                        'id'       => 'haru_gradient_color_3',
                        'type'     => 'color',
                        'title'    => esc_html__( 'Gradient Color 3', 'pricom' ),
                        'subtitle' => esc_html__( 'Set Gradient Color 3.', 'pricom' ),
                        'compiler' => true,
                        'default'  => '#f19a73',
                        'validate' => 'color',
                    ),
                    array(
                        'id'       => 'haru_gradient_color_4',
                        'type'     => 'color',
                        'title'    => esc_html__( 'Gradient Color 4', 'pricom' ),
                        'subtitle' => esc_html__( 'Set Gradient Color 4.', 'pricom' ),
                        'compiler' => true,
                        'default'  => '#ffd0b1',
                        'validate' => 'color',
                    ),
                    array(
                        'id'       => 'haru_gradient_color_8',
                        'type'     => 'color',
                        'title'    => esc_html__( 'Gradient Color 8', 'pricom' ),
                        'subtitle' => esc_html__( 'Set Gradient Color 8.', 'pricom' ),
                        'compiler' => true,
                        'default'  => '#fbab83',
                        'validate' => 'color',
                    ),
                    array(
                        'id'       => 'haru_gradient_heading_1',
                        'type'     => 'color',
                        'title'    => esc_html__( 'Gradient Heading 1', 'pricom' ),
                        'subtitle' => esc_html__( 'Set Gradient Heading 4.', 'pricom' ),
                        'compiler' => true,
                        'default'  => '#b1f1b3',
                        'validate' => 'color',
                    ),
                    array(
                        'id'       => 'haru_gradient_heading_2',
                        'type'     => 'color',
                        'title'    => esc_html__( 'Gradient Heading 2', 'pricom' ),
                        'subtitle' => esc_html__( 'Set Gradient Heading 2.', 'pricom' ),
                        'compiler' => true,
                        'default'  => '#f3eec2',
                        'validate' => 'color',
                    ),
                    array(
                        'id'     => 'haru_section_color_dark',
                        'type'   => 'section',
                        'title'  => esc_html__( 'Dark Mode', 'pricom' ),
                        'subtitle' => esc_html__( 'Currently we don\'t allow change Color for Dark Mode to keep the structure of our design. Please notice Pricom does\'t have design for Dark Mode and this function is not working now.', 'pricom' ),
                        'indent' => true
                    ),
                    array(
                        'id'       => 'haru_dark_mode',
                        'type'     => 'switch',
                        'title'    => esc_html__( 'Dark Mode', 'pricom' ),
                        'subtitle' => esc_html__( 'Set Theme to Dark Mode', 'pricom' ),
                        'desc'     => esc_html__( 'This option to change Theme style to Dark Mode.', 'pricom' ),
                        'default'  => false
                    ),
                    array(
                        'id'       => 'haru_dark_mode_button',
                        'type'     => 'switch',
                        'title'    => esc_html__( 'Switch Mode Button', 'pricom' ),
                        'desc'     => esc_html__( 'You can show/hide Theme Switch Mode button at Frontend.', 'pricom' ),
                        'default'  => false,
                    ),
                )
            );
            
            // Typography
            $font_weights = array(
                100 => esc_html__( 'Ultra-Light 100', 'pricom' ),
                200 => esc_html__( 'Light 200', 'pricom' ),
                300 => esc_html__( 'Book 300', 'pricom' ),
                400 => esc_html__( 'Normal 400', 'pricom' ),
                500 => esc_html__( 'Medium 500', 'pricom' ),
                600 => esc_html__( 'Semi-Bold 600', 'pricom' ),
                700 => esc_html__( 'Bold 700', 'pricom' ),
                800 => esc_html__( 'Extra-Bold 800', 'pricom' ),
                900 => esc_html__( 'Ultra-Bold 900', 'pricom' ),
            );

            if ( false == haru_check_custom_fonts_plugin_status() ) {
                $this->sections[] = array(
                    'icon'   => 'el el-font',
                    'subsection' => true,
                    'title'  => esc_html__( 'Typograhpy', 'pricom' ),
                    'desc'   => esc_html__( 'To make sure Typograhpy works you need enable SCSS Compiler and Save Changes 2 times to Regenerate Custom CSS file.', 'pricom' ),
                    'fields' => array(
                        array(
                            'id'     => 'haru_section_custom_fonts',
                            'type'   => 'section',
                            'title'  => esc_html__( 'Custom Fonts', 'pricom' ),
                            'subtitle' => esc_html__( 'Google Font will disabled when you Activate Custom Fonts plugin & follow Custom Fonts tutorial.', 'pricom' ),
                            'indent' => true
                        ),
                        array(
                            'id'    => 'haru_custom_fonts',
                            'type'  => 'info',
                            'style' => 'critical',
                            'title' => esc_html__( 'Custom Fonts', 'pricom' ),
                            'icon'  => 'el el-info-circle',
                            'desc'  => 'Please install & active <a href="https://wordpress.org/plugins/custom-fonts/" target="_blank">Custom Fonts</a> plugin & follow this topic: <a href="https://harutheme.com/forums/topic/how-to-use-custom-fonts-in-harutheme/" target="_blank">https://harutheme.com/forums/topic/how-to-use-custom-fonts-in-harutheme/</a>'
                        ),
                        array(
                            'id'     => 'haru_section_body_font',
                            'type'   => 'section',
                            'title'  => esc_html__( 'Body Font', 'pricom' ),
                            'indent' => true
                        ),
                        array(
                            'id'             => 'haru_body_font',
                            'type'           => 'typography',
                            'title'          => esc_html__( 'Body Font', 'pricom' ),
                            'subtitle'       => esc_html__( 'Set body font properties.', 'pricom' ),
                            'google'         => true,
                            'font_display'    => 'auto',
                            'line-height'    => false,
                            'color'          => false,
                            'letter-spacing' => false,
                            'text-align'     => false,
                            'all_styles'     => true, // Enable all Google Font style/weight variations to be added to the page
                            'output'         => array( 'body' ), // An array of CSS selectors to apply this font style to dynamically
                            'compiler'       => array( 'body' ), // An array of CSS selectors to apply this font style to dynamically
                            'units'          => 'px', // Defaults to px
                            'default'        => array(
                                'font-size'   => '15px',
                                'font-family' => 'Outfit',
                                'font-weight' => '400',
                                'google'      => true,
                            ),
                        ),
                        array(
                            'id'             => 'haru_secondary_font',
                            'type'           => 'typography',
                            'title'          => esc_html__( 'Secondary Font', 'pricom' ),
                            'subtitle'       => esc_html__( 'Set secondary font properties.', 'pricom' ),
                            'desc'           => esc_html__( 'Please don\'t set Font Size for Secondary Font!', 'pricom' ),
                            'google'         => true,
                            'font_display'   => 'auto',
                            'line-height'    => false,
                            'color'          => false,
                            'letter-spacing' => false,
                            'text-align'     => false,
                            'all_styles'     => true, // Enable all Google Font style/weight variations to be added to the page
                            'output'         => array( '.font__secondary' ), // An array of CSS selectors to apply this font style to dynamically
                            'compiler'       => array( '.font__secondary' ), // An array of CSS selectors to apply this font style to dynamically
                            'units'          => 'px', // Defaults to px
                            'default'        => array(
                                'font-size'   => '',
                                'font-family' => 'Yellowtail',
                                'font-weight' => '400',
                                'google'      => true,
                            ),
                        ),
                        array(
                            'id'     => 'haru_section_heading_font',
                            'type'   => 'section',
                            'title'  => esc_html__( 'Heading Font', 'pricom' ),
                            'indent' => true
                        ),
                        array(
                            'id'             => 'haru_h1_font',
                            'type'           => 'typography',
                            'title'          => esc_html__( 'H1 Font', 'pricom' ),
                            'subtitle'       => esc_html__( 'Set H1 font properties.', 'pricom' ),
                            'google'         => true,
                            'font_display'   => 'auto',
                            'letter-spacing' => false,
                            'color'          => false,
                            'line-height'    => false,
                            'text-align'     => false,
                            'all_styles'     => true, // Enable all Google Font style/weight variations to be added to the page
                            'output'         => array( 'h1' ), // An array of CSS selectors to apply this font style to dynamically
                            'compiler'       => array( 'h1' ), // An array of CSS selectors to apply this font style to dynamically
                            'units'          =>'px', // Defaults to px
                            'default'        => array(
                                'font-size'   => '36px',
                                'font-family' => 'Outfit',
                                'font-weight' => '700',
                            ),
                        ),
                        array(
                            'id'             => 'haru_h2_font',
                            'type'           => 'typography',
                            'title'          => esc_html__( 'H2 Font', 'pricom' ),
                            'subtitle'       => esc_html__( 'Set H2 font properties.', 'pricom' ),
                            'google'         => true,
                            'font_display'   => 'auto',
                            'letter-spacing' => false,
                            'color'          => false,
                            'line-height'    => false,
                            'text-align'     => false,
                            'all_styles'     => true, // Enable all Google Font style/weight variations to be added to the page
                            'output'         => array( 'h2' ), // An array of CSS selectors to apply this font style to dynamically
                            'compiler'       => array( 'h2' ), // An array of CSS selectors to apply this font style to dynamically
                            'units'          =>'px', // Defaults to px
                            'default'        => array(
                                'font-size'   => '28px',
                                'font-family' => 'Outfit',
                                'font-weight' => '700',
                            ),
                        ),
                        array(
                            'id'             => 'haru_h3_font',
                            'type'           => 'typography',
                            'title'          => esc_html__( 'H3 Font', 'pricom' ),
                            'subtitle'       => esc_html__( 'Set H3 font properties.', 'pricom' ),
                            'google'         => true,
                            'font_display'   => 'auto',
                            'color'          => false,
                            'line-height'    => false,
                            'letter-spacing' => false,
                            'text-align'     => false,
                            'all_styles'     => true, // Enable all Google Font style/weight variations to be added to the page
                            'output'         => array( 'h3' ), // An array of CSS selectors to apply this font style to dynamically
                            'compiler'       => array( 'h3' ), // An array of CSS selectors to apply this font style to dynamically
                            'units'          =>'px', // Defaults to px
                            'default'        => array(
                                'font-size'   => '24px',
                                'font-family' => 'Outfit',
                                'font-weight' => '700',
                            ),
                        ),
                        array(
                            'id'             => 'haru_h4_font',
                            'type'           => 'typography',
                            'title'          => esc_html__( 'H4 Font', 'pricom' ),
                            'subtitle'       => esc_html__( 'Set H4 font properties.', 'pricom' ),
                            'google'         => true,
                            'font_display'   => 'auto',
                            'color'          => false,
                            'line-height'    => false,
                            'letter-spacing' => false,
                            'text-align'     => false,
                            'all_styles'     => true, // Enable all Google Font style/weight variations to be added to the page
                            'output'         => array( 'h4' ), // An array of CSS selectors to apply this font style to dynamically
                            'compiler'       => array( 'h4' ), // An array of CSS selectors to apply this font style to dynamically
                            'units'          =>'px', // Defaults to px
                            'default'        => array(
                                'font-size'   => '21px',
                                'font-family' => 'Outfit',
                                'font-weight' => '700',
                            ),
                        ),
                        array(
                            'id'             => 'haru_h5_font',
                            'type'           => 'typography',
                            'title'          => esc_html__( 'H5 Font', 'pricom' ),
                            'subtitle'       => esc_html__( 'Set H5 font properties.', 'pricom' ),
                            'google'         => true,
                            'font_display'   => 'auto',
                            'line-height'    => false,
                            'color'          => false,
                            'letter-spacing' => false,
                            'text-align'     => false,
                            'all_styles'     => true, // Enable all Google Font style/weight variations to be added to the page
                            'output'         => array( 'h5' ), // An array of CSS selectors to apply this font style to dynamically
                            'compiler'       => array( 'h5' ), // An array of CSS selectors to apply this font style to dynamically
                            'units'          =>'px', // Defaults to px
                            'default'        => array(
                                'font-size'   => '18px',
                                'font-family' => 'Outfit',
                                'font-weight' => '700',
                            ),
                        ),
                        array(
                            'id'             => 'haru_h6_font',
                            'type'           => 'typography',
                            'title'          => esc_html__( 'H6 Font', 'pricom' ),
                            'subtitle'       => esc_html__( 'Set H6 font properties.', 'pricom' ),
                            'google'         => true,
                            'font_display'   => 'auto',
                            'color'          => false,
                            'line-height'    => false,
                            'letter-spacing' => false,
                            'text-align'     => false,
                            'all_styles'     => true, // Enable all Google Font style/weight variations to be added to the page
                            'output'         => array( 'h6' ), // An array of CSS selectors to apply this font style to dynamically
                            'compiler'       => array( 'h6' ), // An array of CSS selectors to apply this font style to dynamically
                            'units'          =>'px', // Defaults to px
                            'default'        => array(
                                'font-size'   => '15px',
                                'font-family' => 'Outfit',
                                'font-weight' => '700',
                            ),
                        ),
                        array(
                            'id'     => 'haru_section_menu_font',
                            'type'   => 'section',
                            'title'  => esc_html__( 'Menu Font', 'pricom' ),
                            'indent' => true
                        ),
                        array(
                            'id'             => 'haru_menu_font',
                            'type'           => 'typography',
                            'title'          => esc_html__( 'Menu Font', 'pricom' ),
                            'subtitle'       => esc_html__( 'Set Menu Level 0 font properties.', 'pricom' ),
                            'google'         => true,
                            'font_display'   => 'auto',
                            'all_styles'     => false, // Enable all Google Font style/weight variations to be added to the page
                            'color'          => false,
                            'line-height'    => false,
                            'text-align'     => false,
                            'font-style'     => false,
                            'subsets'        => true,
                            'text-transform' => false,
                            'output'         => array( '.haru-nav-menu > li > a' ), // An array of CSS selectors to apply this font style to dynamically
                            'compiler'       => array( '' ), // An array of CSS selectors to apply this font style to dynamically
                            'units'          => 'px', // Defaults to px
                            'default'        => array(
                                'font-family'    => 'Outfit',
                                'font-size'      => '15px',
                                'font-weight'    => '500',
                            ),
                        ),
                        array(
                            'id'     => 'haru_section_page_title_font',
                            'type'   => 'section',
                            'title'  => esc_html__( 'Page Title Font', 'pricom' ),
                            'indent' => true
                        ),
                        array(
                            'id'             => 'haru_page_title_font',
                            'type'           => 'typography',
                            'title'          => esc_html__( 'Page Title Font', 'pricom' ),
                            'subtitle'       => esc_html__( 'Set page title font properties.', 'pricom' ),
                            'google'         => true,
                            'font_display'   => 'auto',
                            'all_styles'     => true, // Enable all Google Font style/weight variations to be added to the page
                            'line-height'    => false,
                            'color'          => false,
                            'text-align'     => false,
                            'font-style'     => true,
                            'subsets'        => true,
                            'font-size'      => true,
                            'font-weight'    => true,
                            'text-transform' => false,
                            'output'         => array( '.page-title-inner h1' ), // An array of CSS selectors to apply this font style to dynamically
                            'compiler'       => array(), // An array of CSS selectors to apply this font style to dynamically
                            'units'          => 'px', // Defaults to px
                            'default'        => array(
                                'font-family'    => 'Outfit',
                                'font-size'      => '36px',
                                'font-weight'    => '700',
                            ),
                        ),
                        array(
                            'id'             => 'haru_page_sub_title_font',
                            'type'           => 'typography',
                            'title'          => esc_html__( 'Page Sub Title Font', 'pricom' ),
                            'subtitle'       => esc_html__( 'Set page sub title font properties.', 'pricom' ),
                            'google'         => true,
                            'font-display'   => 'auto',
                            'all_styles'     => true, // Enable all Google Font style/weight variations to be added to the page
                            'line-height'    => false,
                            'color'          => false,
                            'font-style'     => true,
                            'text-align'     => false,
                            'subsets'        => true,
                            'font-size'      => true,
                            'font-weight'    => true,
                            'text-transform' => false,
                            'output'         => array( '.page-title-inner .page-sub-title' ), // An array of CSS selectors to apply this font style to dynamically
                            'compiler'       => array(), // An array of CSS selectors to apply this font style to dynamically
                            'units'          => 'px', // Defaults to px
                            'default'        => array(
                                'font-family'    => 'Outfit',
                                'font-size'      => '14px',
                                'font-weight'    => '400',
                            ),
                        ),
                    ),
                );
            } else {
                $this->sections[] = array(
                    'icon'   => 'el el-font',
                    'subsection' => true,
                    'title'  => esc_html__( 'Typograhpy', 'pricom' ),
                    'desc'   => esc_html__( 'To make sure Typograhpy works you need enable SCSS Compiler and Save Changes 2 times to Regenerate Custom CSS file.', 'pricom' ),
                    'fields' => array(
                        array(
                            'id'     => 'haru_section_custom_fonts',
                            'type'   => 'section',
                            'title'  => esc_html__( 'Custom Fonts', 'pricom' ),
                            'subtitle' => esc_html__( 'Google Font will disabled when you Activate Custom Fonts plugin & follow Custom Fonts tutorial.', 'pricom' ),
                            'indent' => true
                        ),
                        array(
                            'id'    => 'haru_custom_fonts',
                            'type'  => 'info',
                            'style' => 'critical',
                            'title' => esc_html__( 'Custom Fonts', 'pricom' ),
                            'icon'  => 'el el-info-circle',
                            'desc'  => 'Please install & active <a href="https://wordpress.org/plugins/custom-fonts/" target="_blank">Custom Fonts</a> plugin & follow this topic: <a href="https://harutheme.com/forums/topic/how-to-use-custom-fonts-in-harutheme/" target="_blank">https://harutheme.com/forums/topic/how-to-use-custom-fonts-in-harutheme/</a>'
                        ),
                        array(
                            'id'     => 'haru_section_body_font',
                            'type'   => 'section',
                            'title'  => esc_html__( 'Body Font', 'pricom' ),
                            'indent' => true
                        ),
                        array(
                            'id'             => 'haru_body_font',
                            'type'           => 'typography',
                            'title'          => esc_html__( 'Body Font', 'pricom' ),
                            'subtitle'       => esc_html__( 'Set body font properties.', 'pricom' ),
                            'google'         => false,
                            'font_display'   => 'auto',
                            'weights'        => $font_weights,
                            'line-height'    => false,
                            'color'          => false,
                            'letter-spacing' => false,
                            'text-align'     => false,
                            'all_styles'     => true, // Enable all Google Font style/weight variations to be added to the page
                            'output'         => array( 'body' ), // An array of CSS selectors to apply this font style to dynamically
                            'compiler'       => array( 'body' ), // An array of CSS selectors to apply this font style to dynamically
                            'units'          => 'px', // Defaults to px
                            'default'        => array(
                                'font-size'   => '15px',
                                'font-family' => 'Arial, Helvetica, sans-serif',
                                'font-weight' => '400',
                                'google'      => false,
                            ),
                        ),
                        array(
                            'id'             => 'haru_secondary_font',
                            'type'           => 'typography',
                            'title'          => esc_html__( 'Secondary Font', 'pricom' ),
                            'subtitle'       => esc_html__( 'Set secondary font properties.', 'pricom' ),
                            'desc'           => esc_html__( 'Please don\'t set Font Size for Secondary Font!', 'pricom' ),
                            'google'         => false,
                            'font_display'   => 'auto',
                            'weights'        => $font_weights,
                            'line-height'    => false,
                            'color'          => false,
                            'letter-spacing' => false,
                            'text-align'     => false,
                            'all_styles'     => true, // Enable all Google Font style/weight variations to be added to the page
                            'output'         => array( '.font__secondary' ), // An array of CSS selectors to apply this font style to dynamically
                            'compiler'       => array( '.font__secondary' ), // An array of CSS selectors to apply this font style to dynamically
                            'units'          => 'px', // Defaults to px
                            'default'        => array(
                                'font-size'   => '',
                                'font-family' => 'Arial, Helvetica, sans-serif',
                                'font-weight' => '400',
                                'google'      => false,
                            ),
                        ),
                        array(
                            'id'     => 'haru_section_heading_font',
                            'type'   => 'section',
                            'title'  => esc_html__( 'Heading Font', 'pricom' ),
                            'indent' => true
                        ),
                        array(
                            'id'             => 'haru_h1_font',
                            'type'           => 'typography',
                            'title'          => esc_html__( 'H1 Font', 'pricom' ),
                            'subtitle'       => esc_html__( 'Set H1 font properties.', 'pricom' ),
                            'google'         => false,
                            'font_display'   => 'auto',
                            'weights'        => $font_weights,
                            'letter-spacing' => false,
                            'color'          => false,
                            'line-height'    => false,
                            'text-align'     => false,
                            'all_styles'     => true, // Enable all Google Font style/weight variations to be added to the page
                            'output'         => array( 'h1' ), // An array of CSS selectors to apply this font style to dynamically
                            'compiler'       => array( 'h1' ), // An array of CSS selectors to apply this font style to dynamically
                            'units'          =>'px', // Defaults to px
                            'default'        => array(
                                'font-size'   => '36px',
                                'font-family' => 'Arial, Helvetica, sans-serif',
                                'font-weight' => '700',
                                'google'      => false,
                            ),
                        ),
                        array(
                            'id'             => 'haru_h2_font',
                            'type'           => 'typography',
                            'title'          => esc_html__( 'H2 Font', 'pricom' ),
                            'subtitle'       => esc_html__( 'Set H2 font properties.', 'pricom' ),
                            'google'         => false,
                            'font_display'   => 'auto',
                            'weights'        => $font_weights,
                            'letter-spacing' => false,
                            'color'          => false,
                            'line-height'    => false,
                            'text-align'     => false,
                            'all_styles'     => true, // Enable all Google Font style/weight variations to be added to the page
                            'output'         => array( 'h2' ), // An array of CSS selectors to apply this font style to dynamically
                            'compiler'       => array( 'h2' ), // An array of CSS selectors to apply this font style to dynamically
                            'units'          =>'px', // Defaults to px
                            'default'        => array(
                                'font-size'   => '28px',
                                'font-family' => 'Arial, Helvetica, sans-serif',
                                'font-weight' => '700',
                                'google'      => false,
                            ),
                        ),
                        array(
                            'id'             => 'haru_h3_font',
                            'type'           => 'typography',
                            'title'          => esc_html__( 'H3 Font', 'pricom' ),
                            'subtitle'       => esc_html__( 'Set H3 font properties.', 'pricom' ),
                            'google'         => false,
                            'font_display'   => 'auto',
                            'weights'        => $font_weights,
                            'color'          => false,
                            'line-height'    => false,
                            'letter-spacing' => false,
                            'text-align'     => false,
                            'all_styles'     => true, // Enable all Google Font style/weight variations to be added to the page
                            'output'         => array( 'h3' ), // An array of CSS selectors to apply this font style to dynamically
                            'compiler'       => array( 'h3' ), // An array of CSS selectors to apply this font style to dynamically
                            'units'          =>'px', // Defaults to px
                            'default'        => array(
                                'font-size'   => '24px',
                                'font-family' => 'Arial, Helvetica, sans-serif',
                                'font-weight' => '700',
                                'google'      => false,
                            ),
                        ),
                        array(
                            'id'             => 'haru_h4_font',
                            'type'           => 'typography',
                            'title'          => esc_html__( 'H4 Font', 'pricom' ),
                            'subtitle'       => esc_html__( 'Set H4 font properties.', 'pricom' ),
                            'google'         => false,
                            'font_display'   => 'auto',
                            'weights'        => $font_weights,
                            'color'          => false,
                            'line-height'    => false,
                            'letter-spacing' => false,
                            'text-align'     => false,
                            'all_styles'     => true, // Enable all Google Font style/weight variations to be added to the page
                            'output'         => array( 'h4' ), // An array of CSS selectors to apply this font style to dynamically
                            'compiler'       => array( 'h4' ), // An array of CSS selectors to apply this font style to dynamically
                            'units'          =>'px', // Defaults to px
                            'default'        => array(
                                'font-size'   => '21px',
                                'font-family' => 'Arial, Helvetica, sans-serif',
                                'font-weight' => '700',
                                'google'      => false,
                            ),
                        ),
                        array(
                            'id'             => 'haru_h5_font',
                            'type'           => 'typography',
                            'title'          => esc_html__( 'H5 Font', 'pricom' ),
                            'subtitle'       => esc_html__( 'Set H5 font properties.', 'pricom' ),
                            'google'         => false,
                            'font_display'   => 'auto',
                            'weights'        => $font_weights,
                            'line-height'    => false,
                            'color'          => false,
                            'letter-spacing' => false,
                            'text-align'     => false,
                            'all_styles'     => true, // Enable all Google Font style/weight variations to be added to the page
                            'output'         => array( 'h5' ), // An array of CSS selectors to apply this font style to dynamically
                            'compiler'       => array( 'h5' ), // An array of CSS selectors to apply this font style to dynamically
                            'units'          =>'px', // Defaults to px
                            'default'        => array(
                                'font-size'   => '18px',
                                'font-family' => 'Arial, Helvetica, sans-serif',
                                'font-weight' => '700',
                                'google'      => false,
                            ),
                        ),
                        array(
                            'id'             => 'haru_h6_font',
                            'type'           => 'typography',
                            'title'          => esc_html__( 'H6 Font', 'pricom' ),
                            'subtitle'       => esc_html__( 'Set H6 font properties.', 'pricom' ),
                            'google'         => false,
                            'font_display'   => 'auto',
                            'weights'        => $font_weights,
                            'color'          => false,
                            'line-height'    => false,
                            'letter-spacing' => false,
                            'text-align'     => false,
                            'all_styles'     => true, // Enable all Google Font style/weight variations to be added to the page
                            'output'         => array( 'h6' ), // An array of CSS selectors to apply this font style to dynamically
                            'compiler'       => array( 'h6' ), // An array of CSS selectors to apply this font style to dynamically
                            'units'          =>'px', // Defaults to px
                            'default'        => array(
                                'font-size'   => '15px',
                                'font-family' => 'Arial, Helvetica, sans-serif',
                                'font-weight' => '700',
                                'google'      => false,
                            ),
                        ),
                        array(
                            'id'     => 'haru_section_menu_font',
                            'type'   => 'section',
                            'title'  => esc_html__( 'Menu Font', 'pricom' ),
                            'indent' => true
                        ),
                        array(
                            'id'             => 'haru_menu_font',
                            'type'           => 'typography',
                            'title'          => esc_html__( 'Menu Font', 'pricom' ),
                            'subtitle'       => esc_html__( 'Set Menu Level 0 font properties.', 'pricom' ),
                            'google'         => false,
                            'font_display'   => 'auto',
                            'weights'        => $font_weights,
                            'all_styles'     => false, // Enable all Google Font style/weight variations to be added to the page
                            'color'          => false,
                            'line-height'    => false,
                            'text-align'     => false,
                            'font-style'     => false,
                            'subsets'        => true,
                            'text-transform' => false,
                            'output'         => array( '.haru-nav-menu > li > a' ), // An array of CSS selectors to apply this font style to dynamically
                            'compiler'       => array( '' ), // An array of CSS selectors to apply this font style to dynamically
                            'units'          => 'px', // Defaults to px
                            'default'        => array(
                                'font-family' => 'Arial, Helvetica, sans-serif',
                                'font-size'      => '15px',
                                'font-weight'    => '500',
                                'google'      => false,
                            ),
                        ),
                        array(
                            'id'     => 'haru_section_page_title_font',
                            'type'   => 'section',
                            'title'  => esc_html__( 'Page Title Font', 'pricom' ),
                            'indent' => true
                        ),
                        array(
                            'id'             => 'haru_page_title_font',
                            'type'           => 'typography',
                            'title'          => esc_html__( 'Page Title Font', 'pricom' ),
                            'subtitle'       => esc_html__( 'Set page title font properties.', 'pricom' ),
                            'google'         => false,
                            'font_display'   => 'auto',
                            'weights'        => $font_weights,
                            'all_styles'     => true, // Enable all Google Font style/weight variations to be added to the page
                            'line-height'    => false,
                            'color'          => false,
                            'text-align'     => false,
                            'font-style'     => true,
                            'subsets'        => true,
                            'font-size'      => true,
                            'font-weight'    => true,
                            'text-transform' => false,
                            'output'         => array( '.page-title-inner h1' ), // An array of CSS selectors to apply this font style to dynamically
                            'compiler'       => array(), // An array of CSS selectors to apply this font style to dynamically
                            'units'          => 'px', // Defaults to px
                            'default'        => array(
                                'font-family' => 'Arial, Helvetica, sans-serif',
                                'font-size'      => '36px',
                                'font-weight'    => '700',
                                'google'      => false,
                            ),
                        ),
                        array(
                            'id'             => 'haru_page_sub_title_font',
                            'type'           => 'typography',
                            'title'          => esc_html__( 'Page Sub Title Font', 'pricom' ),
                            'subtitle'       => esc_html__( 'Set page sub title font properties.', 'pricom' ),
                            'google'         => false,
                            'font-display'   => 'auto',
                            'weights'        => $font_weights,
                            'all_styles'     => true, // Enable all Google Font style/weight variations to be added to the page
                            'line-height'    => false,
                            'color'          => false,
                            'font-style'     => true,
                            'text-align'     => false,
                            'subsets'        => true,
                            'font-size'      => true,
                            'font-weight'    => true,
                            'text-transform' => false,
                            'output'         => array( '.page-title-inner .page-sub-title' ), // An array of CSS selectors to apply this font style to dynamically
                            'compiler'       => array(), // An array of CSS selectors to apply this font style to dynamically
                            'units'          => 'px', // Defaults to px
                            'default'        => array(
                                'font-family' => 'Arial, Helvetica, sans-serif',
                                'font-size'      => '14px',
                                'font-weight'    => '400',
                                'google'      => false,
                            ),
                        ),
                    ),
                );
            }

            $this->sections[] = array(
                'icon'   => 'el el-cogs',
                'subsection' => true,
                'title'  => esc_html__( 'SCSS Variables', 'pricom' ),
                'desc'   => esc_html__( 'Allow to change Element height base, border radius, font weights, ...', 'pricom' ),
                'fields' => array(
                    array(
                        'id'    => 'haru_scss_variables_notice',
                        'type'  => 'info',
                        'style' => 'critical',
                        'title' => esc_html__( 'SCSS Variables', 'pricom' ),
                        'icon'  => 'el el-info-circle',
                        'desc'  => esc_html__( 'Change SCSS Variables is not recommended because it can break the design structure! Please use our default settings for the best design display.', 'pricom' )
                    ),
                    array(
                        'id'     => 'haru_section_font_size',
                        'type'   => 'section',
                        'title'  => esc_html__( 'Font Size Define', 'pricom' ),
                        'subtitle' => esc_html__( 'Define font size. Example almost fonts is 14px but some fonts is 15px or 16px!', 'pricom' ),
                        'indent' => true
                    ),
                    array(
                        'id'       => 'haru_font_size_base',
                        'type'     => 'slider',
                        'title'    => esc_html__( 'Font Size Base', 'pricom' ),
                        'subtitle' => esc_html__( 'Set font size base', 'pricom' ),
                        'default'  => '16',
                        'min'      => 14,
                        'step'     => 1,
                        'max'      => 16,
                    ),
                    array(
                        'id'     => 'haru_section_font_weights',
                        'type'   => 'section',
                        'title'  => esc_html__( 'Font Weights Define', 'pricom' ),
                        'subtitle' => esc_html__( 'Define font weights. Example almost fonts is 700 but some fonts Bold is 600!', 'pricom' ),
                        'indent' => true
                    ),
                    array(
                        'id'       => 'haru_font_weight_light',
                        'type'     => 'slider',
                        'title'    => esc_html__( 'Font Weight Light', 'pricom' ),
                        'subtitle' => esc_html__( 'Set font weight light', 'pricom' ),
                        'default'  => '300',
                        'min'      => 100,
                        'step'     => 100,
                        'max'      => 900,
                    ),
                    array(
                        'id'       => 'haru_font_weight_normal',
                        'type'     => 'slider',
                        'title'    => esc_html__( 'Font Weight Normal', 'pricom' ),
                        'subtitle' => esc_html__( 'Set font weight normal', 'pricom' ),
                        'default'  => '400',
                        'min'      => 100,
                        'step'     => 100,
                        'max'      => 900,
                    ),
                    array(
                        'id'       => 'haru_font_weight_medium',
                        'type'     => 'slider',
                        'title'    => esc_html__( 'Font Weight Medium', 'pricom' ),
                        'subtitle' => esc_html__( 'Set font weight medium', 'pricom' ),
                        'default'  => '500',
                        'min'      => 100,
                        'step'     => 100,
                        'max'      => 900,
                    ),
                    array(
                        'id'       => 'haru_font_weight_semi_bold',
                        'type'     => 'slider',
                        'title'    => esc_html__( 'Font Weight Semi Bold', 'pricom' ),
                        'subtitle' => esc_html__( 'Set font weight semi bold', 'pricom' ),
                        'default'  => '600',
                        'min'      => 100,
                        'step'     => 100,
                        'max'      => 900,
                    ),
                    array(
                        'id'       => 'haru_font_weight_bold',
                        'type'     => 'slider',
                        'title'    => esc_html__( 'Font Weight Bold', 'pricom' ),
                        'subtitle' => esc_html__( 'Set font weight bold', 'pricom' ),
                        'default'  => '700',
                        'min'      => 100,
                        'step'     => 100,
                        'max'      => 900,
                    ),
                    array(
                        'id'       => 'haru_font_weight_extra_bold',
                        'type'     => 'slider',
                        'title'    => esc_html__( 'Font Weight Extra Bold', 'pricom' ),
                        'subtitle' => esc_html__( 'Set font weight extra bold', 'pricom' ),
                        'default'  => '800',
                        'min'      => 100,
                        'step'     => 100,
                        'max'      => 900,
                    ),
                    array(
                        'id'     => 'haru_section_border_radius_e',
                        'type'   => 'section',
                        'title'  => esc_html__( 'Border Radius Elements', 'pricom' ),
                        'subtitle' => esc_html__( 'Define some border radius value to use for Button, Input, Label.', 'pricom' ),
                        'indent' => true
                    ),
                    array(
                        'id'       => 'haru_border_radius_e',
                        'type'     => 'slider',
                        'title'    => esc_html__( 'Border Radius Base (px)', 'pricom' ),
                        'subtitle' => esc_html__( 'Set border radius base', 'pricom' ),
                        'default'  => '5',
                        'min'      => 0,
                        'step'     => 1,
                        'max'      => 50,
                    ),
                    array(
                        'id'       => 'haru_border_radius_e_tiny',
                        'type'     => 'slider',
                        'title'    => esc_html__( 'Border Radius Tiny (px)', 'pricom' ),
                        'subtitle' => esc_html__( 'Set border radius tiny', 'pricom' ),
                        'default'  => '5',
                        'min'      => 0,
                        'step'     => 1,
                        'max'      => 50,
                    ),
                    array(
                        'id'       => 'haru_border_radius_e_small',
                        'type'     => 'slider',
                        'title'    => esc_html__( 'Border Radius Small (px)', 'pricom' ),
                        'subtitle' => esc_html__( 'Set border radius small', 'pricom' ),
                        'default'  => '3',
                        'min'      => 0,
                        'step'     => 1,
                        'max'      => 50,
                    ),
                    array(
                        'id'       => 'haru_border_radius_e_medium',
                        'type'     => 'slider',
                        'title'    => esc_html__( 'Border Radius Medium (px)', 'pricom' ),
                        'subtitle' => esc_html__( 'Set border radius medium', 'pricom' ),
                        'default'  => '8',
                        'min'      => 0,
                        'step'     => 1,
                        'max'      => 50,
                    ),
                    array(
                        'id'       => 'haru_border_radius_e_large',
                        'type'     => 'slider',
                        'title'    => esc_html__( 'Border Radius Large (px)', 'pricom' ),
                        'subtitle' => esc_html__( 'Set border radius large', 'pricom' ),
                        'default'  => '10',
                        'min'      => 0,
                        'step'     => 1,
                        'max'      => 50,
                    ),
                    array(
                        'id'       => 'haru_border_radius_e_extra_large',
                        'type'     => 'slider',
                        'title'    => esc_html__( 'Border Radius Extra Large (px)', 'pricom' ),
                        'subtitle' => esc_html__( 'Set border radius extra large', 'pricom' ),
                        'default'  => '20',
                        'min'      => 0,
                        'step'     => 1,
                        'max'      => 50,
                    ),
                    array(
                        'id'     => 'haru_section_border_radius',
                        'type'   => 'section',
                        'title'  => esc_html__( 'Border Radius Layout', 'pricom' ),
                        'subtitle' => esc_html__( 'Define some border radius value to use for Elements ( not Button, Input, Label ) like images, products, section,...', 'pricom' ),
                        'indent' => true
                    ),
                    array(
                        'id'       => 'haru_border_radius',
                        'type'     => 'slider',
                        'title'    => esc_html__( 'Border Radius Base (px)', 'pricom' ),
                        'subtitle' => esc_html__( 'Set border radius base', 'pricom' ),
                        'default'  => '5',
                        'min'      => 0,
                        'step'     => 1,
                        'max'      => 50,
                    ),
                    array(
                        'id'       => 'haru_border_radius_tiny',
                        'type'     => 'slider',
                        'title'    => esc_html__( 'Border Radius Tiny (px)', 'pricom' ),
                        'subtitle' => esc_html__( 'Set border radius tiny', 'pricom' ),
                        'default'  => '5',
                        'min'      => 0,
                        'step'     => 1,
                        'max'      => 50,
                    ),
                    array(
                        'id'       => 'haru_border_radius_small',
                        'type'     => 'slider',
                        'title'    => esc_html__( 'Border Radius Small (px)', 'pricom' ),
                        'subtitle' => esc_html__( 'Set border radius small', 'pricom' ),
                        'default'  => '3',
                        'min'      => 0,
                        'step'     => 1,
                        'max'      => 50,
                    ),
                    array(
                        'id'       => 'haru_border_radius_medium',
                        'type'     => 'slider',
                        'title'    => esc_html__( 'Border Radius Medium (px)', 'pricom' ),
                        'subtitle' => esc_html__( 'Set border radius medium', 'pricom' ),
                        'default'  => '8',
                        'min'      => 0,
                        'step'     => 1,
                        'max'      => 50,
                    ),
                    array(
                        'id'       => 'haru_border_radius_large',
                        'type'     => 'slider',
                        'title'    => esc_html__( 'Border Radius Large (px)', 'pricom' ),
                        'subtitle' => esc_html__( 'Set border radius large', 'pricom' ),
                        'default'  => '10',
                        'min'      => 0,
                        'step'     => 1,
                        'max'      => 50,
                    ),
                    array(
                        'id'       => 'haru_border_radius_extra_large',
                        'type'     => 'slider',
                        'title'    => esc_html__( 'Border Radius Extra Large (px)', 'pricom' ),
                        'subtitle' => esc_html__( 'Set border radius extra large', 'pricom' ),
                        'default'  => '20',
                        'min'      => 0,
                        'step'     => 1,
                        'max'      => 50,
                    ),
                ),
            );
            
            // WordPress Setting
            $this->sections[] = array(
                'title'  => esc_html__( 'WordPress Setting', 'pricom' ),
                'desc'   => '',
                'icon'   => 'el el-website',
                'fields' => array(

                )
            );

            // Pages Setting
            $this->sections[] = array(
                'title'      => esc_html__( 'Pages Setting', 'pricom' ),
                'desc'       => '',
                'icon'       => 'el el-website',
                'subsection' => true,
                'fields'     => array(
                    array(
                        'id'       => 'haru_page_layout',
                        'type'     => 'button_set',
                        'title'    => esc_html__( 'Layout', 'pricom' ),
                        'desc'     => esc_html__( 'This option can be override by Page Metabox of each page.', 'pricom' ),
                        'options'  => array(
                            'full-width'            => esc_html__( 'Full Width', 'pricom' ),
                            'haru-container'       => esc_html__( 'Container', 'pricom' ),
                            'haru-container haru-container--large'       => esc_html__( 'Large Container', 'pricom' ),
                        ),
                        'default'  => 'haru-container'
                    ),
                    array(
                        'id'       => 'haru_page_sidebar',
                        'type'     => 'image_select',
                        'title'    => esc_html__( 'Sidebar', 'pricom' ),
                        'subtitle' => esc_html__( 'Sidebar Style: None, Left, Right, Two Sidebar', 'pricom' ),
                        'desc'     => esc_html__( 'This option can be override by Page Metabox of each page.', 'pricom' ),
                        'options'  => array(
                            'none'  => array('title' => '', 'img' => get_template_directory_uri().'/framework/admin-assets/images/theme-options/sidebar-none.png'),
                            'left'  => array('title' => '', 'img' => get_template_directory_uri().'/framework/admin-assets/images/theme-options/sidebar-left.png'),
                            'right' => array('title' => '', 'img' => get_template_directory_uri().'/framework/admin-assets/images/theme-options/sidebar-right.png'),
                            'two'   => array('title' => '', 'img' => get_template_directory_uri().'/framework/admin-assets/images/theme-options/sidebar-two.png'),
                        ),
                        'default' => 'none'
                    ),
                    array(
                        'id'       => 'haru_page_left_sidebar',
                        'type'     => 'select',
                        'title'    => esc_html__( 'Left Sidebar', 'pricom' ),
                        'subtitle' => esc_html__( 'Choose the default left sidebar', 'pricom' ),
                        'data'     => 'sidebars',
                        'desc'     => esc_html__( 'This option can be override by Page Metabox of each page.', 'pricom' ),
                        'default'  => 'sidebar-1',
                        'required' => array( 'haru_page_sidebar', '=', array( 'left', 'two' ) ),
                    ),
                    array(
                        'id'       => 'haru_page_right_sidebar',
                        'type'     => 'select',
                        'title'    => esc_html__( 'Right Sidebar', 'pricom' ),
                        'subtitle' => esc_html__( 'Choose the default right sidebar', 'pricom' ),
                        'data'     => 'sidebars',
                        'desc'     => esc_html__( 'This option can be override by Page Metabox of each page.', 'pricom' ),
                        'default'  => 'sidebar-2',
                        'required' => array( 'haru_page_sidebar', '=', array( 'right', 'two' ) ),
                    ),
                    array(
                        'id'     => 'haru-section-page-title-setting-start',
                        'type'   => 'section',
                        'title'  => esc_html__( 'Page Title Setting', 'pricom' ),
                        'indent' => true
                    ),
                    array(
                        'id'       => 'haru_show_page_title',
                        'type'     => 'switch',
                        'title'    => esc_html__( 'Show Page Title', 'pricom' ),
                        'desc'     => esc_html__( 'This option can be override by Page Metabox of each page.', 'pricom' ),
                        'default'  => true
                    ),
                    array(
                        'id'       => 'haru_page_title_layout',
                        'type'     => 'button_set',
                        'title'    => esc_html__( 'Page Title Layout', 'pricom' ),
                        'subtitle' => esc_html__( 'This option will use for Background Image layout', 'pricom' ),
                        'desc'     => esc_html__( 'This option can be override by Page Metabox of each page.', 'pricom' ),
                        'options'  => array(
                            'full-width'            => esc_html__( 'Full Width', 'pricom' ),
                            'haru-container'       => esc_html__( 'Container', 'pricom' ),
                            'haru-container haru-container--large'       => esc_html__( 'Large Container', 'pricom' ),
                        ),
                        'default'  => 'full-width',
                        'required' => array( 'haru_show_page_title', '=', array( '1' ) ),
                    ),
                    array(
                        'id'       => 'haru_page_title_content_layout',
                        'type'     => 'button_set',
                        'title'    => esc_html__( 'Page Title Content Layout', 'pricom' ),
                        'subtitle' => esc_html__( 'This option will use for Title, Sub Title and Breadcrumbs layout', 'pricom' ),
                        'desc'     => esc_html__( 'This option can be override by Page Metabox of each page.', 'pricom' ),
                        'options'  => array(
                            'full-width'            => esc_html__( 'Full Width', 'pricom' ),
                            'haru-container'       => esc_html__( 'Container', 'pricom' ),
                            'haru-container haru-container--large'       => esc_html__( 'Large Container', 'pricom' ),
                        ),
                        'default'  => 'haru-container',
                        'required' => array( 'haru_show_page_title', '=', array( '1' ) ),
                    ),
                    array(
                        'id'       => 'haru_page_title_bg_image',
                        'type'     => 'media',
                        'url'      => true,
                        'title'    => esc_html__( 'Page Title Background', 'pricom' ),
                        'desc'     => esc_html__( 'This option can be override by Page Metabox of each page.', 'pricom' ),
                        'default'  => array(),
                        'required'  => array( 'haru_show_page_title', '=', array( '1' ) ),
                    ),
                    array(
                        'id'       => 'haru_page_title_heading',
                        'type'     => 'switch',
                        'title'    => esc_html__( 'Heading', 'pricom' ),
                        'subtitle' => '',
                        'default'  => true,
                        'required'  => array( 'haru_show_page_title', '=', array( '1' ) ),
                    ),
                    array(
                        'id'       => 'haru_page_title_breadcrumbs',
                        'type'     => 'switch',
                        'title'    => esc_html__( 'Breadcrumbs', 'pricom' ),
                        'desc'     => esc_html__( 'This option can be override by Page Metabox of each page.', 'pricom' ),
                        'default'  => true,
                        'required'  => array( 'haru_show_page_title', '=', array( '1' ) ),
                    ),
                )
            );

            // Archive Blog Setting
            $this->sections[] = array(
                'title'      => esc_html__( 'Archive (Blog) Setting', 'pricom' ),
                'desc'       => '',
                'subsection' => true,
                'icon'       => 'el el-folder-close',
                'fields'     => array(
                    array(
                        'id'       => 'haru_archive_layout',
                        'type'     => 'button_set',
                        'title'    => esc_html__( 'Layout', 'pricom' ),
                        'subtitle' => '',
                        'desc'     => '',
                        'options'  => array(
                            'full-width'            => esc_html__( 'Full Width', 'pricom' ),
                            'haru-container'       => esc_html__( 'Container', 'pricom' ),
                            'haru-container haru-container--large'       => esc_html__( 'Large Container', 'pricom' ),
                        ),
                        'default'  => 'haru-container'
                    ),
                    array(
                        'id'       => 'haru_archive_sidebar',
                        'type'     => 'image_select',
                        'title'    => esc_html__( 'Sidebar', 'pricom' ),
                        'subtitle' => esc_html__( 'Sidebar Style: None, Left, Right or Two Sidebar', 'pricom' ),
                        'desc'     => '',
                        'options'  => array(
                            'none'     => array( 'title' => '', 'img' => get_template_directory_uri() . '/framework/admin-assets/images/theme-options/sidebar-none.png' ),
                            'left'     => array( 'title' => '', 'img' => get_template_directory_uri() . '/framework/admin-assets/images/theme-options/sidebar-left.png' ),
                            'right'    => array( 'title' => '', 'img' => get_template_directory_uri() . '/framework/admin-assets/images/theme-options/sidebar-right.png' ),
                            'two'      => array( 'title' => '', 'img' => get_template_directory_uri() . '/framework/admin-assets/images/theme-options/sidebar-two.png' ),
                        ),
                        'default'  => 'left'
                    ),
                    array(
                        'id'       => 'haru_archive_left_sidebar',
                        'type'     => 'select',
                        'title'    => esc_html__( 'Left Sidebar', 'pricom' ),
                        'subtitle' => '',
                        'desc'     => '',
                        'data'     => 'sidebars',
                        'default'  => 'sidebar-1',
                        'required' => array( 'haru_archive_sidebar', '=', array( 'left', 'two' ) ),
                    ),
                    array(
                        'id'       => 'haru_archive_right_sidebar',
                        'type'     => 'select',
                        'title'    => esc_html__( 'Right Sidebar', 'pricom' ),
                        'subtitle' => '',
                        'desc'     => '',
                        'data'     => 'sidebars',
                        'default'  => 'sidebar-2',
                        'required' => array( 'haru_archive_sidebar', '=', array( 'right', 'two' ) ),
                    ),
                    array(
                        'id'       => 'haru_archive_display_type',
                        'type'     => 'select',
                        'title'    => esc_html__( 'Archive Blog Style', 'pricom' ),
                        'subtitle' => '',
                        'desc'     => '',
                        'options'  => array(
                            'large-image'  => esc_html__( 'Large Image', 'pricom' ),
                            'medium-image' => esc_html__( 'Medium Image', 'pricom' ),
                            'grid'         => esc_html__( 'Grid', 'pricom' ),
                        ),
                        'default'  => 'large-image'
                    ),
                    array(
                        'id'       => 'haru_archive_display_columns',
                        'type'     => 'select',
                        'title'    => esc_html__( 'Archive Display Columns', 'pricom' ),
                        'subtitle' => esc_html__( 'Choose the number of columns to display on archive pages.', 'pricom' ),
                        'desc'     => '',
                        'options'  => array(
                            '2'     => '2',
                            '3'     => '3',
                            '4'     => '4',
                        ),
                        'default'  => '2',
                        'required' => array( 'haru_archive_display_type', '=', array( 'grid' ) ),
                    ),
                    array(
                        'id'       => 'haru_archive_paging_style',
                        'type'     => 'button_set',
                        'title'    => esc_html__( 'Blog Paging Style', 'pricom' ),
                        'subtitle' => '',
                        'desc'     => '',
                        'options'  => array(
                            'default'         => esc_html__( 'Default', 'pricom' ),
                            'load-more'       => esc_html__( 'Load More', 'pricom' ),
                        ),
                        'default'  => 'default'
                    ),
                    array(
                        'id'        => 'haru_archive_number_exceprt',
                        'type'      => 'text',
                        'title'     => esc_html__( 'Length of excerpt (words)', 'pricom' ),
                        'default'   => '30'
                    ),
                    array(
                        'id'     => 'haru-section-archive-title-setting-start',
                        'type'   => 'section',
                        'title'  => esc_html__( 'Archive Title Setting', 'pricom' ),
                        'indent' => true
                    ),
                    array(
                        'id'       => 'haru_show_archive_title',
                        'type'     => 'switch',
                        'title'    => esc_html__( 'Archive Page Title', 'pricom' ),
                        'subtitle' => '',
                        'default'  => true
                    ),
                    array(
                        'id'       => 'haru_archive_title_layout',
                        'type'     => 'button_set',
                        'title'    => esc_html__( 'Archive Title Layout', 'pricom' ),
                        'subtitle' => '',
                        'desc'     => '',
                        'options'  => array(
                            'full-width'            => esc_html__( 'Full Width', 'pricom' ),
                            'haru-container'       => esc_html__( 'Container', 'pricom' ),
                            'haru-container haru-container--large'       => esc_html__( 'Large Container', 'pricom' ),
                        ),
                        'default'  => 'full-width',
                        'required' => array( 'haru_show_archive_title', '=', array( '1' ) ),
                    ),
                    array(
                        'id'       => 'haru_archive_title_content_layout',
                        'type'     => 'button_set',
                        'title'    => esc_html__( 'Archive Title Content Layout', 'pricom' ),
                        'subtitle' => '',
                        'desc'     => '',
                        'options'  => array(
                            'full-width'            => esc_html__( 'Full Width', 'pricom' ),
                            'haru-container'       => esc_html__( 'Container', 'pricom' ),
                            'haru-container haru-container--large'       => esc_html__( 'Large Container', 'pricom' ),
                        ),
                        'default'  => 'haru-container',
                        'required' => array( 'haru_show_archive_title', '=', array( '1' ) ),
                    ),
                    array(
                        'id'       => 'haru_archive_title_bg_image',
                        'type'     => 'media',
                        'url'      => true,
                        'title'    => esc_html__( 'Archive Title Background', 'pricom' ),
                        'subtitle' => '',
                        'desc'     => '',
                        'default'  =>  array(),
                        'required' => array( 'haru_show_archive_title', '=', array( '1' ) ),
                    ),
                    array(
                        'id'       => 'haru_archive_title_heading',
                        'type'     => 'switch',
                        'title'    => esc_html__( 'Heading', 'pricom' ),
                        'subtitle' => '',
                        'default'  => true,
                        'required' => array( 'haru_show_archive_title', '=', array( '1' ) ),
                    ),
                    array(
                        'id'       => 'haru_archive_title_breadcrumbs',
                        'type'     => 'switch',
                        'title'    => esc_html__( 'Breadcrumbs', 'pricom' ),
                        'subtitle' => '',
                        'default'  => true,
                        'required' => array( 'haru_show_archive_title', '=', array( '1' ) ),
                    ),
                )
            );

            // Single Blog Settings
            $this->sections[] = array(
                'title'      => esc_html__( 'Single (Blog) Setting', 'pricom' ),
                'desc'       => '',
                'icon'       => 'el el-file',
                'subsection' => true,
                'fields'     => array(
                    array(
                        'id'       => 'haru_single_layout',
                        'type'     => 'button_set',
                        'title'    => esc_html__( 'Layout', 'pricom' ),
                        'subtitle' => '',
                        'desc'     => '',
                        'options'  => array(
                            'full-width'            => esc_html__( 'Full Width', 'pricom' ),
                            'haru-container'       => esc_html__( 'Container', 'pricom' ),
                            'haru-container haru-container--large'       => esc_html__( 'Large Container', 'pricom' ),
                        ),
                        'default'  => 'haru-container'
                    ),
                    array(
                        'id'       => 'haru_single_sidebar',
                        'type'     => 'image_select',
                        'title'    => esc_html__( 'Sidebar', 'pricom' ),
                        'subtitle' => esc_html__( 'Sidebar Style: None, Left, Right or Two Sidebar', 'pricom' ),
                        'desc'     => '',
                        'options'  => array(
                            'none'     => array( 'title' => '', 'img' => get_template_directory_uri() . '/framework/admin-assets/images/theme-options/sidebar-none.png' ),
                            'left'     => array( 'title' => '', 'img' => get_template_directory_uri() . '/framework/admin-assets/images/theme-options/sidebar-left.png' ),
                            'right'    => array( 'title' => '', 'img' => get_template_directory_uri() . '/framework/admin-assets/images/theme-options/sidebar-right.png' ),
                            'two'      => array( 'title' => '', 'img' => get_template_directory_uri() . '/framework/admin-assets/images/theme-options/sidebar-two.png' ),
                        ),
                        'default'  => 'left'
                    ),
                    array(
                        'id'       => 'haru_single_left_sidebar',
                        'type'     => 'select',
                        'title'    => esc_html__( 'Left Sidebar', 'pricom' ),
                        'subtitle' => '',
                        'data'     => 'sidebars',
                        'desc'     => '',
                        'default'  => 'sidebar-1',
                        'required' => array( 'haru_single_sidebar', '=', array( 'left', 'two' ) ),
                    ),
                    array(
                        'id'       => 'haru_single_right_sidebar',
                        'type'     => 'select',
                        'title'    => esc_html__( 'Right Sidebar', 'pricom' ),
                        'subtitle' => '',
                        'data'     => 'sidebars',
                        'desc'     => '',
                        'default'  => 'sidebar-2',
                        'required' => array( 'haru_single_sidebar', '=', array( 'right', 'two' ) ),
                    ),

                    array(
                        'id'       => 'haru_single_navigation',
                        'type'     => 'switch',
                        'title'    => esc_html__( 'Post Navigation', 'pricom' ),
                        'subtitle' => esc_html__( 'Show/Hide Next/Pre post', 'pricom' ),
                        'default'  => false
                    ),

                    array(
                        'id'       => 'haru_single_author_info',
                        'type'     => 'switch',
                        'title'    => esc_html__( 'Author Info', 'pricom' ),
                        'subtitle' => esc_html__( 'Show/Hide Author Info', 'pricom' ),
                        'default'  => false
                    ),

                    array(
                        'id'       => 'haru_single_related',
                        'type'     => 'switch',
                        'title'    => esc_html__( 'Post Related', 'pricom' ),
                        'subtitle' => esc_html__( 'Show/Hide Post Related', 'pricom' ),
                        'default'  => false
                    ),

                    array(
                        'id'     => 'haru-section-single-blog-title-setting-start',
                        'type'   => 'section',
                        'title'  => esc_html__( 'Single Blog Title Setting', 'pricom' ),
                        'indent' => true
                    ),
                    array(
                        'id'       => 'haru_show_single_title',
                        'type'     => 'switch',
                        'title'    => esc_html__( 'Single Blog Title', 'pricom' ),
                        'subtitle' => '',
                        'default'  => true
                    ),
                    array(
                        'id'       => 'haru_single_title_layout',
                        'type'     => 'button_set',
                        'title'    => esc_html__( 'Single Blog Title Layout', 'pricom' ),
                        'subtitle' => '',
                        'desc'     => '',
                        'options'  => array(
                            'full-width'            => esc_html__( 'Full Width', 'pricom' ),
                            'haru-container'       => esc_html__( 'Container', 'pricom' ),
                            'haru-container haru-container--large'       => esc_html__( 'Large Container', 'pricom' ),
                        ),
                        'default'  => 'full-width',
                        'required' => array( 'haru_show_single_title', '=', array( '1' ) ),
                    ),
                    array(
                        'id'       => 'haru_single_title_content_layout',
                        'type'     => 'button_set',
                        'title'    => esc_html__( 'Single Blog Title Content Layout', 'pricom' ),
                        'subtitle' => '',
                        'desc'     => '',
                        'options'  => array(
                            'full-width'            => esc_html__( 'Full Width', 'pricom' ),
                            'haru-container'       => esc_html__( 'Container', 'pricom' ),
                            'haru-container haru-container--large'       => esc_html__( 'Large Container', 'pricom' ),
                        ),
                        'default'  => 'haru-container',
                        'required' => array( 'haru_show_single_title', '=', array( '1' ) ),
                    ),
                    array(
                        'id'       => 'haru_single_title_bg_image',
                        'type'     => 'media',
                        'url'      => true,
                        'title'    => esc_html__( 'Single Blog Title Background', 'pricom' ),
                        'subtitle' => '',
                        'desc'     => '',
                        'default'  =>  array(),
                        'required'  => array( 'haru_show_single_title', '=', array( '1' ) )
                    ),
                    array(
                        'id'       => 'haru_single_title_heading',
                        'type'     => 'switch',
                        'title'    => esc_html__( 'Heading', 'pricom' ),
                        'subtitle' => '',
                        'default'  => false,
                        'required' => array( 'haru_show_single_title', '=', array( '1' ) ),
                    ),
                    array(
                        'id'       => 'haru_single_title_breadcrumbs',
                        'type'     => 'switch',
                        'title'    => esc_html__( 'Breadcrumbs', 'pricom' ),
                        'subtitle' => '',
                        'default'  => true,
                        'required' => array( 'haru_show_single_title', '=', array( '1' ) ),
                    ),
                )
            );

            if ( true == haru_check_woocommerce_status() ) {
                // WooCommerce
                $this->sections[] = array(
                    'title'  => esc_html__( 'WooCommerce', 'pricom' ),
                    'desc'   => '',
                    'icon'   => 'el el-shopping-cart-sign',
                    'fields' => array(
                        array(
                            'id'       => 'haru_product_sale_flash_mode',
                            'type'     => 'button_set',
                            'title'    => esc_html__( 'Sale Badge Mode', 'pricom' ),
                            'subtitle' => esc_html__( 'Choose Sale Badge Mode', 'pricom' ),
                            'desc'     => '',
                            'options'  => array(
                                'text'    => esc_html__( 'Text', 'pricom' ),
                                'percent' => esc_html__( 'Percent', 'pricom' )
                            ),
                            'default'  => 'percent'
                        ),
                        array(
                            'id'       => 'haru_product_attribute',
                            'type'     => 'product_attribute',
                            'title'    => esc_html__( 'Product Attribute', 'pricom' ),
                            'subtitle' => esc_html__( 'Show Product Attribute (Apply for Color, Image & Label attribute type in Products -> Attributes)', 'pricom' ),
                            'default' => ''
                        ),
                        array(
                            'id'       => 'haru_product_quick_view',
                            'type'     => 'switch',
                            'title'    => esc_html__( 'Quick View Button', 'pricom' ),
                            'subtitle' => esc_html__( 'Enable/Disable Quick View', 'pricom' ),
                            'default'  => true
                        ),
                        array(
                            'id'       => 'haru_product_add_wishlist',
                            'type'     => 'switch',
                            'title'    => esc_html__( 'Add To Wishlist Button', 'pricom' ),
                            'subtitle' => esc_html__( 'Enable/Disable Add To Wishlist Button', 'pricom' ),
                            'default'  => true
                        ),
                        array(
                            'id'       => 'haru_product_add_to_compare',
                            'type'     => 'switch',
                            'title'    => esc_html__( 'Add To Compare Button', 'pricom' ),
                            'subtitle' => esc_html__( 'Enable/Disable Add To Compare Button', 'pricom' ),
                            'default'  => true
                        ),
                    )
                );

                // Archive Product
                $this->sections[] = array(
                    'title'      => esc_html__( 'Archive Product (Shop)', 'pricom' ),
                    'desc'       => '',
                    'icon'       => 'el el-book',
                    'subsection' => true,
                    'fields'     => array(
                        array(
                            'id'       => 'haru_product_per_page',
                            'type'     => 'text',
                            'title'    => esc_html__( 'Products Per Page', 'pricom' ),
                            'desc'     => esc_html__( 'This must be numeric or empty (default 12).', 'pricom' ),
                            'subtitle' => '',
                            'validate' => 'numeric',
                            'default'  => '12',
                        ),
                        array(
                            'id'    => 'haru_product_per_row',
                            'type'  => 'info',
                            'style' => 'success',
                            'title' => esc_html__( 'Products per row ( Columns )', 'pricom' ),
                            'icon'  => 'el el-info-circle',
                            'desc'  => __( 'You can set Products per row in Appearence -> Customize -> WooCommerce ( Closest Additional CSS ) -> Product Catalog.', 'pricom')
                        ),
                        array(
                            'id'     => 'haru-section-archive-product-layout-start',
                            'type'   => 'section',
                            'title'  => esc_html__( 'Layout Options', 'pricom' ),
                            'indent' => true
                        ),
                        array(
                            'id'       => 'haru_archive_product_layout',
                            'type'     => 'button_set',
                            'title'    => esc_html__( 'Archive Product Layout', 'pricom' ),
                            'subtitle' => '',
                            'desc'     => '',
                            'options'  => array(
                                'full-width'            => esc_html__( 'Full Width', 'pricom' ),
                                'haru-container'       => esc_html__( 'Container', 'pricom' ),
                                'haru-container haru-container--large'       => esc_html__( 'Large Container', 'pricom' ),
                            ),
                            'default'  => 'haru-container'
                        ),
                        array(
                            'id'       => 'haru_archive_product_hidden_sidebar_layout',
                            'type'     => 'switch',
                            'title'    => esc_html__( 'Hidden Sidebar', 'pricom' ),
                            'subtitle' => esc_html__( 'Use Hidden Sidebar layout', 'pricom' ),
                            'default'  => false
                        ),
                        array(
                            'id'       => 'haru_archive_product_hidden_sidebar_style',
                            'type'     => 'button_set',
                            'title'    => esc_html__( 'Hidden Sidebar Style', 'pricom' ),
                            'subtitle' => '',
                            'desc'     => esc_html__( '', 'pricom' ),
                            'options'  => array(
                                'fixed'       => esc_html__( 'Fixed', 'pricom' ),
                                'toggle'      => esc_html__( 'Toggle', 'pricom' ),
                            ),
                            'default'  => 'fixed',
                            'required' => array( 'haru_archive_product_hidden_sidebar_layout', '=', array( '1' ) ),
                        ),
                        array(
                            'id'       => 'haru_archive_product_hidden_sidebar',
                            'type'     => 'select',
                            'title'    => esc_html__( 'Archive Product Hidden Sidebar', 'pricom' ),
                            'subtitle' => '',
                            'data'     => 'sidebars',
                            'desc'     => '',
                            'default'  => 'woocommerce',
                            'required' => array( 'haru_archive_product_hidden_sidebar_layout', '=', array( '1' ) ),
                        ),
                        array(
                            'id'       => 'haru_archive_product_sidebar',
                            'type'     => 'image_select',
                            'title'    => esc_html__( 'Archive Product Sidebar', 'pricom' ),
                            'subtitle' => esc_html__( 'None, Left or Right Sidebar', 'pricom' ),
                            'desc'     => '',
                            'options'  => array(
                                'none'     => array( 'title' => '', 'img' => get_template_directory_uri() . '/framework/admin-assets/images/theme-options/sidebar-none.png' ),
                                'left'     => array( 'title' => '', 'img' => get_template_directory_uri() . '/framework/admin-assets/images/theme-options/sidebar-left.png' ),
                                'right'    => array( 'title' => '', 'img' => get_template_directory_uri() . '/framework/admin-assets/images/theme-options/sidebar-right.png' ),
                                'two'      => array( 'title' => '', 'img' => get_template_directory_uri() . '/framework/admin-assets/images/theme-options/sidebar-two.png' ),
                            ),
                            'default'  => 'left',
                            'required' => array( 'haru_archive_product_hidden_sidebar_layout', '=', array( '0' ) ),
                        ),
                        array(
                            'id'       => 'haru_archive_product_left_sidebar',
                            'type'     => 'select',
                            'title'    => esc_html__( 'Archive Product Left Sidebar', 'pricom' ),
                            'subtitle' => '',
                            'data'     => 'sidebars',
                            'desc'     => '',
                            'default'  => 'woocommerce',
                            'required' => array( 'haru_archive_product_sidebar', '=', array( 'left', 'two' ) ),
                        ),
                        array(
                            'id'       => 'haru_archive_product_right_sidebar',
                            'type'     => 'select',
                            'title'    => esc_html__( 'Archive Product Right Sidebar', 'pricom' ),
                            'subtitle' => '',
                            'data'     => 'sidebars',
                            'desc'     => '',
                            'default'  => 'woocommerce',
                            'required' => array( 'haru_archive_product_sidebar', '=', array( 'right', 'two' ) ),
                        ),
                        array(
                            'id'       => 'haru_archive_product_hidden_sidebar_mobile_layout',
                            'type'     => 'switch',
                            'title'    => esc_html__( 'Hidden Sidebar Mobile', 'pricom' ),
                            'subtitle' => esc_html__( 'Use Hidden Sidebar layout on Mobile', 'pricom' ),
                            'desc'     => esc_html__( 'If you use Hidden Sidebar on Mobile the Archive Product Sidebar above will hidden on mobile.', 'pricom' ),
                            'default'  => false,
                            'required' => array( 'haru_archive_product_hidden_sidebar_layout', '=', array( '0' ) ),
                        ),
                        array(
                            'id'       => 'haru_archive_product_hidden_sidebar_mobile_style',
                            'type'     => 'button_set',
                            'title'    => esc_html__( 'Hidden Sidebar Mobile Style', 'pricom' ),
                            'subtitle' => '',
                            'desc'     => esc_html__( '', 'pricom' ),
                            'options'  => array(
                                'fixed'       => esc_html__( 'Fixed', 'pricom' ),
                                'toggle'      => esc_html__( 'Toggle', 'pricom' ),
                            ),
                            'default'  => 'fixed',
                            'required' => array( 'haru_archive_product_hidden_sidebar_mobile_layout', '=', array( '1' ) ),
                        ),
                        array(
                            'id'       => 'haru_archive_product_hidden_sidebar_mobile',
                            'type'     => 'select',
                            'title'    => esc_html__( 'Archive Product Hidden Sidebar Mobile', 'pricom' ),
                            'subtitle' => '',
                            'data'     => 'sidebars',
                            'desc'     => '',
                            'default'  => 'woocommerce',
                            'required' => array( 'haru_archive_product_hidden_sidebar_mobile_layout', '=', array( '1' ) ),
                        ),
                        array(
                            'id'       => 'haru_archive_product_widget_scroll',
                            'type'     => 'switch',
                            'title'    => esc_html__( 'Widget Scroll', 'pricom' ),
                            'subtitle' => esc_html__( 'Use Scroll when widget is too long.', 'pricom' ),
                            'default'  => true
                        ),
                        array(
                            'id'       => 'haru_archive_product_widget_toggle',
                            'type'     => 'switch',
                            'title'    => esc_html__( 'Widget Toggle', 'pricom' ),
                            'subtitle' => esc_html__( 'Use Toggle when widget is too long.', 'pricom' ),
                            'default'  => true
                        ),
                        array(
                            'id'       => 'haru_archive_product_style',
                            'type'     => 'button_set',
                            'title'    => esc_html__( 'Archive Product Style', 'pricom' ),
                            'subtitle' => '',
                            'desc'     => '',
                            'options'  => array(
                                'style-1'            => esc_html__( 'Style 1', 'pricom' ),
                                'style-2'       => esc_html__( 'Style 2', 'pricom' ),
                            ),
                            'default'  => 'style-1',
                        ),
                        array(
                            'id'     => 'haru-section-archive-product-layout-end',
                            'type'   => 'section',
                            'indent' => false
                        ),
                        array(
                            'id'     => 'haru-section-archive-product-title-start',
                            'type'   => 'section',
                            'title'  => esc_html__( 'Page Title Options', 'pricom' ),
                            'indent' => true
                        ),
                        array(
                            'id'       => 'haru_show_archive_product_title',
                            'type'     => 'switch',
                            'title'    => esc_html__( 'Archive Product Title', 'pricom' ),
                            'subtitle' => '',
                            'default'  => true
                        ),
                        array(
                            'id'       => 'haru_archive_product_title_layout',
                            'type'     => 'button_set',
                            'title'    => esc_html__( 'Archive Product Title Layout', 'pricom' ),
                            'subtitle' => '',
                            'desc'     => '',
                            'options'  => array(
                                'full-width'            => esc_html__( 'Full Width', 'pricom' ),
                                'haru-container'       => esc_html__( 'Container', 'pricom' ),
                                'haru-container haru-container--large'       => esc_html__( 'Large Container', 'pricom' ),
                            ),
                            'default'  => 'full-width',
                            'required' => array( 'haru_show_archive_product_title', '=', array( '1' ) ),
                        ),
                        array(
                            'id'       => 'haru_archive_product_title_content_layout',
                            'type'     => 'button_set',
                            'title'    => esc_html__( 'Archive Product Title Content Layout', 'pricom' ),
                            'subtitle' => '',
                            'desc'     => '',
                            'options'  => array(
                                'full-width'            => esc_html__( 'Full Width', 'pricom' ),
                                'haru-container'       => esc_html__( 'Container', 'pricom' ),
                                'haru-container haru-container--large'       => esc_html__( 'Large Container', 'pricom' ),
                            ),
                            'default'  => 'haru-container',
                            'required' => array( 'haru_show_archive_product_title', '=', array( '1' ) ),
                        ),
                        array(
                            'id'       => 'haru_archive_product_title_bg_image',
                            'type'     => 'media',
                            'url'      => true,
                            'title'    => esc_html__( 'Archive Product Title Background', 'pricom' ),
                            'subtitle' => '',
                            'desc'     => '',
                            'default'  => array(),
                            'required'  => array( 'haru_show_archive_product_title', '=', array( '1' ) ),
                        ),
                        array(
                            'id'       => 'haru_archive_product_title_heading',
                            'type'     => 'switch',
                            'title'    => esc_html__( 'Heading', 'pricom' ),
                            'subtitle' => '',
                            'default'  => true,
                            'required' => array( 'haru_show_archive_product_title', '=', array( '1' ) ),
                        ),
                        array(
                            'id'       => 'haru_archive_product_title_breadcrumbs',
                            'type'     => 'switch',
                            'title'    => esc_html__( 'Breadcrumbs', 'pricom' ),
                            'subtitle' => '',
                            'default'  => true,
                            'required'  => array( 'haru_show_archive_product_title', '=', array( '1' ) ),
                        ),

                    )
                );

                // Single Product
                $this->sections[] = array(
                    'title'      => esc_html__( 'Single Product', 'pricom' ),
                    'desc'       => '',
                    'icon'       => 'el el-laptop',
                    'subsection' => true,
                    'fields'     => array(
                        array(
                            'id'     => 'haru-section-single-product-layout-start',
                            'type'   => 'section',
                            'title'  => esc_html__( 'Layout Options', 'pricom' ),
                            'indent' => true
                        ),
                        array(
                            'id'       => 'haru_single_product_layout',
                            'type'     => 'button_set',
                            'title'    => esc_html__( 'Single Product Layout', 'pricom' ),
                            'subtitle' => '',
                            'desc'     => '',
                            'options'  => array(
                                'full-width'            => esc_html__( 'Full Width', 'pricom' ),
                                'haru-container'       => esc_html__( 'Container', 'pricom' ),
                                'haru-container haru-container--large'       => esc_html__( 'Large Container', 'pricom' ),
                            ),
                            'default'  => 'haru-container'
                        ),
                        array(
                            'id'       => 'haru_single_product_style',
                            'type'     => 'select',
                            'title'    => esc_html__( 'Single Product Style', 'pricom' ),
                            'subtitle' => '',
                            'desc'     => '',
                            'options'  => array(
                                'horizontal'     => esc_html__( 'Horizontal Slide', 'pricom' ),
                                'vertical'       => esc_html__( 'Vertical Slide', 'pricom' ),
                                'vertical_gallery'       => esc_html__( 'Vertical Gallery', 'pricom' ),
                                'grid_gallery'      => esc_html__( 'Grid Gallery', 'pricom' ),
                            ),
                            'default'  => 'horizontal'
                        ),
                        array(
                            'id'       => 'haru_single_product_thumbnail_columns',
                            'type'     => 'select',
                            'title'    => esc_html__( 'Product Thumbnail Columns', 'pricom' ),
                            'subtitle' => esc_html__( 'Choose the number of columns to display thumbnails.', 'pricom' ),
                            'options'  => array(
                                '2'     => '2',
                                '3'     => '3',
                                '4'     => '4',
                                '5'     => '5'
                            ),
                            'desc'    => '',
                            'default' => '4',
                            'required'  => array( 'haru_single_product_style', '=', array( 'horizontal', 'vertical' ) ),
                        ),
                        array(
                            'id'       => 'haru_single_product_thumbnail_position',
                            'type'     => 'button_set',
                            'title'    => esc_html__( 'Product Thumbnails Position', 'pricom' ),
                            'subtitle' => '',
                            'desc'     => '',
                            'options'  => array(
                                'thumbnail-left'        => esc_html__( 'Left', 'pricom' ),
                                'thumbnail-right'       => esc_html__( 'Right', 'pricom' ),
                            ),
                            'default'  => 'thumbnail-left',
                            'required'  => array( 'haru_single_product_style', '=', array( 'vertical' ) ),
                        ),
                        array(
                            'id'       => 'haru_single_product_sticky_image',
                            'type'     => 'select',
                            'title'    => esc_html__( 'Sticky Product Images', 'pricom' ),
                            'subtitle' => '',
                            'desc'     => esc_html__( 'This option can be override by Page Metabox of each Product.', 'pricom' ),
                            'options'  => array(
                                'no-sticky'  => esc_html__( 'No Sticky', 'pricom' ),
                                'sticky'     => esc_html__( 'Sticky', 'pricom' ),
                            ),
                            'default'  => 'no-sticky',
                            'required' => array( 'haru_single_product_style', '=', array( 'horizontal', 'vertical' ) ),
                        ),
                        array(
                            'id'       => 'haru_single_product_sidebar',
                            'type'     => 'image_select',
                            'title'    => esc_html__( 'Single Product Sidebar', 'pricom' ),
                            'subtitle' => esc_html__( 'None, Left or Right Sidebar', 'pricom' ),
                            'desc'     => '',
                            'options'  => array(
                                'none'     => array( 'title' => '', 'img' => get_template_directory_uri() . '/framework/admin-assets/images/theme-options/sidebar-none.png' ),
                                'left'     => array( 'title' => '', 'img' => get_template_directory_uri() . '/framework/admin-assets/images/theme-options/sidebar-left.png' ),
                                'right'    => array( 'title' => '', 'img' => get_template_directory_uri() . '/framework/admin-assets/images/theme-options/sidebar-right.png' ),
                                'two'      => array( 'title' => '', 'img' => get_template_directory_uri() . '/framework/admin-assets/images/theme-options/sidebar-two.png' ),
                            ),
                            'default' => 'none'
                        ),
                        array(
                            'id'       => 'haru_single_product_left_sidebar',
                            'type'     => 'select',
                            'title'    => esc_html__( 'Single Product Left Sidebar', 'pricom' ),
                            'subtitle' => '',
                            'data'     => 'sidebars',
                            'desc'     => '',
                            'default'  => 'woocommerce',
                            'required' => array( 'haru_single_product_sidebar', '=', array( 'left', 'two' ) ),
                        ),
                        array(
                            'id'       => 'haru_single_product_right_sidebar',
                            'type'     => 'select',
                            'title'    => esc_html__( 'Single Product Right Sidebar', 'pricom' ),
                            'subtitle' => '',
                            'data'     => 'sidebars',
                            'desc'     => '',
                            'default'  => 'woocommerce',
                            'required' => array( 'haru_single_product_sidebar', '=', array( 'right', 'two' ) ),
                        ),
                        array(
                            'id'       => 'haru_single_product_sticky_cart',
                            'type'     => 'select',
                            'title'    => esc_html__( 'Sticky Add To Cart', 'pricom' ),
                            'subtitle' => esc_html__( 'Sticky Add To Cart button when scroll on Desktop.', 'pricom' ),
                            'desc'     => esc_html__( 'This option can be override by Page Metabox of each Product and will hide on Mobile Devices.', 'pricom' ),
                            'options'  => array(
                                'no-sticky'  => esc_html__( 'No Sticky', 'pricom' ),
                                'sticky'     => esc_html__( 'Sticky', 'pricom' ),
                            ),
                            'default'  => 'no-sticky',
                        ),
                        array(
                            'id'       => 'haru_single_product_navigation',
                            'type'     => 'select',
                            'title'    => esc_html__( 'Navigation', 'pricom' ),
                            'subtitle' => esc_html__( 'Product Next, Previous products navigation.', 'pricom' ),
                            'options'  => array(
                                'hide'  => esc_html__( 'Hide', 'pricom' ),
                                'show'  => esc_html__( 'Show', 'pricom' ),
                            ),
                            'default'  => 'hide',
                        ),
                        array(
                            'id'     => 'haru-section-single-product-layout-end',
                            'type'   => 'section',
                            'indent' => false
                        ),
                        array(
                            'id'     => 'haru-section-single-product-related-start',
                            'type'   => 'section',
                            'title'  => esc_html__( 'Related Product Options', 'pricom' ),
                            'indent' => true
                        ),
                        array(
                            'id'       => 'haru_related_product_count',
                            'type'     => 'text',
                            'title'    => esc_html__( 'Related Products Number', 'pricom' ),
                            'subtitle' => '',
                            'validate' => 'number',
                            'default'  => '6',
                        ),
                        array(
                            'id'       => 'haru_related_product_display_columns',
                            'type'     => 'select',
                            'title'    => esc_html__( 'Related Product Display Columns', 'pricom' ),
                            'subtitle' => '',
                            'options'  => array(
                                '3'     => esc_html__( '3', 'pricom' ),
                                '4'     => esc_html__( '4', 'pricom' ),
                            ),
                            'desc'    => '',
                            'default' => '4'
                        ),
                        array(
                            'id'       => 'haru_related_product_display_type',
                            'type'     => 'button_set',
                            'title'    => esc_html__( 'Related Product Display Type', 'pricom' ),
                            'subtitle' => '',
                            'desc'     => '',
                            'options'  => array(
                                'slideshow'     => esc_html__( 'Slideshow', 'pricom' ),
                                'grid'          => esc_html__( 'Grid', 'pricom' ),
                            ),
                            'default'  => 'slideshow',
                        ),
                        array(
                            'id'     => 'haru-section-single-product-related-end',
                            'type'   => 'section',
                            'indent' => false
                        ),
                        array(
                            'id'     => 'haru-section-single-product-title-start',
                            'type'   => 'section',
                            'title'  => esc_html__( 'Page Title Options', 'pricom' ),
                            'indent' => true
                        ),
                        array(
                            'id'       => 'haru_show_single_product_title',
                            'type'     => 'switch',
                            'title'    => esc_html__( 'Single Title', 'pricom' ),
                            'subtitle' => '',
                            'default'  => true
                        ),
                        array(
                            'id'       => 'haru_single_product_title_layout',
                            'type'     => 'button_set',
                            'title'    => esc_html__( 'Single Product Title Layout', 'pricom' ),
                            'subtitle' => '',
                            'desc'     => '',
                            'options'  => array(
                                'full-width'            => esc_html__( 'Full Width', 'pricom' ),
                                'haru-container'       => esc_html__( 'Container', 'pricom' ),
                                'haru-container haru-container--large'       => esc_html__( 'Large Container', 'pricom' ),
                            ),
                            'default'  => 'full-width',
                            'required' => array( 'haru_show_single_product_title', '=', array( '1' ) ),
                        ),
                        array(
                            'id'       => 'haru_single_product_title_content_layout',
                            'type'     => 'button_set',
                            'title'    => esc_html__( 'Archive Product Title Content Layout', 'pricom' ),
                            'subtitle' => '',
                            'desc'     => '',
                            'options'  => array(
                                'full-width'            => esc_html__( 'Full Width', 'pricom' ),
                                'haru-container'       => esc_html__( 'Container', 'pricom' ),
                                'haru-container haru-container--large'       => esc_html__( 'Large Container', 'pricom' ),
                            ),
                            'default'  => 'haru-container',
                            'required' => array( 'haru_show_single_product_title', '=', array( '1' ) ),
                        ),
                        array(
                            'id'       => 'haru_single_product_title_bg_image',
                            'type'     => 'media',
                            'url'      => true,
                            'title'    => esc_html__( 'Single Product Title Background', 'pricom' ),
                            'subtitle' => '',
                            'desc'     => '',
                            'default'  => array(),
                            'required'  => array( 'haru_show_single_product_title', '=', array( '1' ) ),
                        ),
                        array(
                            'id'       => 'haru_single_product_title_heading',
                            'type'     => 'switch',
                            'title'    => esc_html__( 'Heading', 'pricom' ),
                            'subtitle' => '',
                            'default'  => false,
                            'required' => array( 'haru_show_single_product_title', '=', array( '1' ) ),
                        ),
                        array(
                            'id'       => 'haru_single_product_title_breadcrumbs',
                            'type'     => 'switch',
                            'title'    => esc_html__( 'Breadcrumbs', 'pricom' ),
                            'subtitle' => '',
                            'default'  => true,
                            'required'  => array( 'haru_show_single_product_title', '=', array( '1' ) ),
                        ),
                        array(
                            'id'     => 'haru-section-single-product-title-end',
                            'type'   => 'section',
                            'indent' => false
                        ),
                    )
                );

                if ( true == haru_check_wpc_product_options_plugin_status() ) {
                    $this->sections[] = array(
                        'title'      => esc_html__( 'Single Product Options', 'pricom' ),
                        'desc'       => '',
                        'icon'       => 'el el-wrench-alt',
                        'subsection' => true,
                        'fields'     => array(
                            array(
                                'id'     => 'haru-section-single-product-extra-start',
                                'type'   => 'section',
                                'title'  => esc_html__( 'Extra Options', 'pricom' ),
                                'indent' => true
                            ),
                            array(
                                'id'    => 'haru_single_product_extra_options_notice',
                                'type'  => 'info',
                                'style' => 'critical',
                                'title' => esc_html__( 'Extra Options', 'pricom' ),
                                'icon'  => 'el el-info-circle',
                                'desc'  => 'Please install & active <a href="https://wordpress.org/plugins/wpc-product-options/" target="_blank">WPC Product Options for WooCommerce</a> plugin & follow this topic: <a href="https://harutheme.com/forums/topic/how-to-use-woocommerce-product-extra-options/" target="_blank">https://harutheme.com/forums/topic/how-to-use-woocommerce-product-extra-options/</a>'
                            ),
                            array(
                                'id'       => 'haru_single_product_extra_options',
                                'type'     => 'button_set',
                                'title'    => esc_html__( 'Extra Options Style', 'pricom' ),
                                'subtitle' => '',
                                'desc'     => esc_html__( 'This option can be override by Product Metabox of each Product.', 'pricom' ),
                                'options'  => array(
                                    'show'         => esc_html__( 'Show', 'pricom' ),
                                    'toggle'       => esc_html__( 'Toggle', 'pricom' ),
                                ),
                                'default'  => 'show'
                            ),
                            array(
                                'id'       => 'haru_single_product_extra_options_limit',
                                'type'     => 'text',
                                'title'    => esc_html__( 'File Size Limit', 'pricom' ),
                                'subtitle' => '',
                                'desc'     => esc_html__( 'Setting for File Upload field. This must be numeric or empty (default is 1), unit is MB. ', 'pricom' ),
                                'validate' => 'numeric',
                                'default'  => '32',
                            ),
                        ),
                    );
                }

                // Buy Now
                $this->sections[] = array(
                    'title'      => esc_html__( 'Buy Now Options', 'pricom' ),
                    'desc'       => '',
                    'icon'       => 'el el-shopping-cart',
                    'subsection' => true,
                    'fields'     => array(
                        array(
                            'id'       => 'haru_product_buy_now',
                            'type'     => 'switch',
                            'title'    => esc_html__( 'Buy Now Button', 'pricom' ),
                            'subtitle' => esc_html__( 'Enable/Disable Buy Now Button', 'pricom' ),
                            'default'  => false
                        ),
                        array(
                            'id'       => 'haru_woo_buy_now_single_position',
                            'type'     => 'select',
                            'title'    => esc_html__( 'Single Position', 'pricom' ),
                            'subtitle' => esc_html__( 'Buy Now Single Position', 'pricom' ),
                            'desc'     => esc_html__( 'Set position for Buy Now button on Single Product page', 'pricom' ),
                            'options'  => array(
                                'after_add_to_cart'       => esc_html__( 'After Add to Cart', 'pricom' ),
                                'before_add_to_cart'       => esc_html__( 'Before Add to Cart', 'pricom' ),
                            ),
                            'default'  => 'after_add_to_cart',
                            'required' => array( 'haru_product_buy_now', '=', array( '1' ) ),
                        ),
                        array(
                            'id'       => 'haru_product_buy_now_archive',
                            'type'     => 'switch',
                            'title'    => esc_html__( 'Archive Buy Now Button', 'pricom' ),
                            'subtitle' => esc_html__( 'Enable/Disable Buy Now Button on Archive', 'pricom' ),
                            'desc'     => esc_html__( 'Buy Now button may show only on Simple Product', 'pricom' ),
                            'default'  => false,
                            'required' => array( 'haru_product_buy_now', '=', array( '1' ) ),
                        ),
                        array(
                            'id'       => 'haru_woo_buy_now_archive_position',
                            'type'     => 'select',
                            'title'    => esc_html__( 'Archive Position', 'pricom' ),
                            'subtitle' => esc_html__( 'Buy Now Archive Position', 'pricom' ),
                            'desc'     => esc_html__( 'Set position for Buy Now button on Archive Product page', 'pricom' ),
                            'options'  => array(
                                'after_price'       => esc_html__( 'After Price', 'pricom' ),
                            ),
                            'default'  => 'after_price',
                            'required' => array( 'haru_product_buy_now_archive', '=', array( '1' ) ),
                        ),
                        array(
                            'id'       => 'haru_woo_buy_now_cats',
                            'type'     => 'select',
                            'multi'    => true,
                            'data'     => 'terms',
                            'args'     => array( 
                                'taxonomies' => 'product_cat',
                                'hide_empty' => false
                            ),
                            'title'    => esc_html__( 'Categories Display', 'pricom' ),
                            'subtitle' => esc_html__( 'Buy Now Categories Display', 'pricom' ),
                            'desc'     => esc_html__( 'Set Categories to display Buy Now button. If not set will display on all Product Categories', 'pricom' ),
                            'default'  => array(),
                            'required' => array( 'haru_product_buy_now', '=', array( '1' ) ),
                        ),
                        array(
                            'id'       => 'haru_woo_buy_now_hide_atc',
                            'type'     => 'switch',
                            'title'    => esc_html__( 'Hide Add To Cart Button', 'pricom' ),
                            'subtitle' => esc_html__( 'Enable/Disable hide Add To Cart button', 'pricom' ),
                            'desc'     => esc_html__( 'Hide the default Add To Cart button on products that already has Buy Now button', 'pricom' ),
                            'default'  => false,
                            'required' => array( 'haru_product_buy_now', '=', array( '1' ) ),
                        ),
                        array(
                            'id'       => 'haru_woo_buy_now_redirect',
                            'type'     => 'select',
                            'title'    => esc_html__( 'Redirect', 'pricom' ),
                            'subtitle' => esc_html__( 'Buy Now Redirect', 'pricom' ),
                            'desc'     => esc_html__( 'Set redirect after click Buy Now button', 'pricom' ),
                            'options'  => array(
                                'checkout'   => esc_html__( 'Checkout', 'pricom' ),
                                'cart'       => esc_html__( 'Cart', 'pricom' ),
                                'custom'       => esc_html__( 'Custom URL', 'pricom' ),
                            ),
                            'default'  => 'checkout',
                            'required' => array( 'haru_product_buy_now', '=', array( '1' ) ),
                        ),
                        array(
                            'id'       => 'haru_woo_buy_now_custom_redirect',
                            'type'     => 'text',
                            'title'    => esc_html__( 'Custom Redirect URL', 'pricom' ),
                            'desc'     => esc_html__( 'Insert Custom Redirect URL after click Buy Now button.', 'pricom' ),
                            'subtitle' => '',
                            'default'  => '/',
                            'required' => array( 'haru_woo_buy_now_redirect', '=', array( 'custom' ) ),
                        ),
                    )
                );
            }

            // Bottom Toolbar
            $this->sections[] = array(
                'title'  => esc_html__( 'Bottom Toolbar', 'pricom' ),
                'desc'   => '',
                'subsection' => false,
                'icon'   => 'el el-credit-card',
                'fields' => array(
                    array(
                        'id'       => 'haru_bottom_toolbar',
                        'type'     => 'select',
                        'title'    => esc_html__( 'Bottom Toolbar', 'pricom' ),
                        'subtitle' => esc_html__( 'WooCommerce bottom toolbar for quick access on Mobile Devices.', 'pricom' ),
                        'desc'     => esc_html__( 'Bottom Toolbar show only on Mobile Devices.', 'pricom' ),
                        'options'  => array(
                            'hide'  => esc_html__( 'Hide', 'pricom' ),
                            'show'  => esc_html__( 'Show', 'pricom' ),
                        ),
                        'default'  => 'hide',
                    ),
                    array(
                        'id'       => 'haru_bottom_toolbar_template',
                        'type'     => 'footer',
                        'title'    => esc_html__( 'Bottom Toolbar Template', 'pricom' ),
                        'subtitle' => esc_html__( 'Please go to Footer Builder to create Bottom Toolbar.', 'pricom'),
                        'desc'     => esc_html__( 'This option will show on mobile devices only.', 'pricom' ),
                        'required' => array( 'haru_bottom_toolbar', '=', array( 'show' ) ),
                    ),
                )
            );

            // Social options
            $this->sections[] = array(
                'title'  => esc_html__( 'Social Settings', 'pricom' ),
                'desc'   => '',
                'icon'   => 'el el-facebook',
                'fields' => array(
                    array(
                        'title'    => esc_html__( 'Social Share', 'pricom' ),
                        'subtitle' => esc_html__( 'Show the social sharing in blog posts or custom posttype', 'pricom' ),
                        'id'       => 'haru_social_sharing',
                        'type'     => 'checkbox',
                        // Must provide key => value pairs for multi checkbox options
                        'options'  => array(
                            'facebook'  => esc_html__( 'Facebook', 'pricom' ),
                            'twitter'   => esc_html__( 'Twitter', 'pricom' ),
                            'linkedin'  => esc_html__( 'Linkedin', 'pricom' ),
                            'tumblr'    => esc_html__( 'Tumblr', 'pricom' ),
                            'pinterest' => esc_html__( 'Pinterest', 'pricom' ),
                            'vk'        => esc_html__( 'VK', 'pricom' ),
                            'telegram'  => esc_html__( 'Telegram', 'pricom' ),
                            'whatsapp'  => esc_html__( 'WhatsApp', 'pricom' ),
                            'email'     => esc_html__( 'Email', 'pricom' ),
                        ),

                        // See how default has changed? you also don't need to specify opts that are 0.
                        'default' => array(
                            'facebook'  => '1',
                            'twitter'   => '1',
                            'linkedin'  => '1',
                            'tumblr'    => '1',
                            'pinterest' => '1',
                            'vk'        => '1',
                            'telegram'  => '1',
                            'whatsapp'  => '0',
                            'email'     => '0',
                        )
                    )
                )
            );

            // Popup Configs
            $this->sections[] = array(
                'title'  => esc_html__( 'Newsletter Popup', 'pricom' ),
                'desc'   => '',
                'icon'   => 'el el-photo',
                'fields' => array(
                    array(
                        'id'       => 'haru_show_popup',
                        'type'     => 'switch',
                        'title'    => esc_html__( 'Show Popup', 'pricom' ),
                        'subtitle' => '',
                        'default'  => false
                    ),
                    array(
                        'id'       => 'haru_popup_width',
                        'type'     => 'text',
                        'title'    => esc_html__( 'Popup Width', 'pricom' ),
                        'subtitle' => esc_html__( 'Please set with of popup (number only in px)', 'pricom' ),
                        'validate' => 'numeric',
                        'desc'     => '',
                        'default'  => '750',
                        'required' => array( 'haru_show_popup', '=', array( '1' ) ),
                    ),
                    array(
                        'id'       => 'haru_popup_height',
                        'type'     => 'text',
                        'title'    => esc_html__( 'Popup Height', 'pricom' ),
                        'subtitle' => esc_html__( 'Please set height of popup (number only in px)', 'pricom' ),
                        'validate' => 'numeric',
                        'desc'     => '',
                        'default'  => '450',
                        'required' => array( 'haru_show_popup', '=', array( '1' ) ),
                    ),
                    array(
                        'id'       => 'haru_popup_effect',
                        'type'     => 'select',
                        'title'    => esc_html__( 'Popup Effect', 'pricom' ),
                        'subtitle' => '',
                        'options'  => array(
                            'mfp-zoom-in'         => esc_html__( 'ZoomIn', 'pricom' ),
                            'mfp-newspaper'       => esc_html__( 'Newspaper', 'pricom' ),
                            'mfp-move-horizontal' => esc_html__( 'Move Horizontal', 'pricom' ),
                            'mfp-move-from-top'   => esc_html__( 'Move From Top', 'pricom' ),
                            'mfp-3d-unfold'       => esc_html__( '3D Unfold', 'pricom' ),
                            'mfp-zoom-out'        => esc_html__( 'ZoomOut', 'pricom' ),
                            'hinge'               => esc_html__( 'Hinge', 'pricom' )
                        ),
                        'desc'     => '',
                        'default'  => 'mfp-zoom-in',
                        'required' => array( 'haru_show_popup', '=', array( '1' ) ),
                    ),
                    array(
                        'id'       => 'haru_popup_delay',
                        'type'     => 'text',
                        'title'    => esc_html__( 'Popup Delay', 'pricom' ),
                        'subtitle' => esc_html__( 'Please set delay of popup (caculate by miliseconds)', 'pricom' ),
                        'validate' => 'numeric',
                        'desc'     => '',
                        'default'  => '5000',
                        'required' => array( 'haru_show_popup', '=', array( '1' ) ),
                    ),
                    array(
                        'id'       => 'haru_popup_content',
                        'type'     => 'editor',
                        'title'    => esc_html__( 'Popup Content', 'pricom' ),
                        'subtitle' => esc_html__( 'Please set content of popup. You can use shortcode here.', 'pricom' ),
                        'desc'     => '',
                        'default'  => '',
                        'required' => array( 'haru_show_popup', '=', array( '1' ) ),
                    ),
                    array(
                        'id'       => 'haru_popup_background',
                        'type'     => 'media',
                        'title'    => esc_html__( 'Popup Background', 'pricom' ),
                        'url'      => true,
                        'subtitle' => '',
                        'desc'     => '',
                        'default'  => array(
                            'url'  =>  ''
                        ),
                        'required' => array( 'haru_show_popup', '=', array( '1' ) ),
                    ),

                )
            );
        }

        public function setHelpTabs() {

        }

        /**
         * All the possible arguments for Redux.
         * For full documentation on arguments, please refer to: https://github.com/ReduxFramework/ReduxFramework/wiki/Arguments
         * */
        public function setArguments() {

            $theme = wp_get_theme(); // For use with some settings. Not necessary.

            $this->args = array(
                // TYPICAL -> Change these values as you need/desire
                'opt_name'           => 'haru_pricom_options',
                // This is where your data is stored in the database and also becomes your global variable name.
                'display_name'       => $theme->get( 'Name' ),
                // Name that appears at the top of your panel
                'display_version'    => $theme->get( 'Version' ),
                // Version that appears at the top of your panel
                'menu_type'          => 'menu', // or submenu under Appearence
                //Specify if the admin menu should appear or not. Options: menu or submenu (Under appearance only)
                'allow_sub_menu'     => true,
                // Show the sections below the admin menu item or not
                'menu_title'         => esc_html__( 'Theme Options', 'pricom' ),
                'page_title'         => esc_html__( 'Theme Options', 'pricom' ),
                // You will need to generate a Google API key to use this feature.
                // Please visit: https://developers.google.com/fonts/docs/developer_api#Auth
                'google_api_key'     => '',
                // Must be defined to add google fonts to the typography module

                'async_typography'   => true,
                // Use a asynchronous font on the front end or font string
                'font_display'       => 'auto', // block|swap|fallback|optional.
                'admin_bar'          => true,
                // Show the panel pages on the admin bar
                'global_variable'    => '',
                // Set a different name for your global variable other than the opt_name
                'dev_mode'           => false,
                // Show the time the page took to load, etc
                'forced_dev_mode_off' => true,
                // To forcefully disable the dev mode
                'templates_path'     => get_template_directory().'/framework/core/templates/panel',
                // Path to the templates file for various Redux elements
                'customizer'         => true,
                // Enable basic customizer support

                // OPTIONAL -> Give you extra features
                'page_priority'      => null,
                // Order where the menu appears in the admin area. If there is any conflict, something will not show. Warning.
                'page_parent'        => 'themes.php',
                // For a full list of options, visit: http://codex.wordpress.org/Function_Reference/add_theme_page#Parameters
                'page_permissions'   => 'manage_options',
                // Permissions needed to access the options panel.
                'menu_icon'          => '',
                // Specify a custom URL to an icon
                'last_tab'           => '',
                // Force your panel to always open to a specific tab (by id)
                'page_icon'          => 'icon-themes',
                // Icon displayed in the admin panel next to your menu_title
                'page_slug'          => '_options',
                // Page slug used to denote the panel
                'save_defaults'      => true,
                // On load save the defaults to DB before user clicks save or not
                'default_show'       => false,
                // If true, shows the default value next to each field that is not the default value.
                'default_mark'       => '',
                // What to print by the field's title if the value shown is default. Suggested: *
                'show_import_export' => true,
                // Shows the Import/Export panel when not used as a field.

                // CAREFUL -> These options are for advanced use only
                'transient_time'     => 60 * MINUTE_IN_SECONDS,
                'output'             => true,
                // Global shut-off for dynamic CSS output by the framework. Will also disable google fonts output
                'output_tag'         => true,
                // Allows dynamic CSS to be generated for customizer and google fonts, but stops the dynamic CSS from going to the head

                // FUTURE -> Not in use yet, but reserved or partially implemented. Use at your own risk.
                'database'           => '',
                // possible: options, theme_mods, theme_mods_expanded, transient. Not fully functional, warning!
                'system_info'        => false,
                // REMOVE

                // HINTS
                'hints'              => array(
                    'icon'          => 'icon-question-sign',
                    'icon_position' => 'right',
                    'icon_color'    => 'lightgray',
                    'icon_size'     => 'normal',
                    'tip_style'     => array(
                        'color'   => 'light',
                        'shadow'  => true,
                        'rounded' => false,
                        'style'   => '',
                    ),
                    'tip_position'  => array(
                        'my' => 'top left',
                        'at' => 'bottom right',
                    ),
                    'tip_effect'    => array(
                        'show' => array(
                            'effect'   => 'slide',
                            'duration' => '500',
                            'event'    => 'mouseover',
                        ),
                        'hide' => array(
                            'effect'   => 'slide',
                            'duration' => '500',
                            'event'    => 'click mouseleave',
                        ),
                    ),
                )
            );

            // SOCIAL ICONS -> Setup custom links in the footer for quick links in your panel footer icons.
            $args['share_icons'][] = array(
                'url'   => 'https://github.com/ReduxFramework/ReduxFramework',
                'title' => esc_html__( 'Visit us on GitHub', 'pricom' ),
                'icon'  => 'el el-github'
            );
            $args['share_icons'][] = array(
                'url'   => 'https://www.facebook.com/pages/Redux-Framework/243141545850368',
                'title' => esc_html__( 'Like us on Facebook', 'pricom' ),
                'icon'  => 'el el-facebook'
            );
            $args['share_icons'][] = array(
                'url'   => 'https://twitter.com/reduxframework',
                'title' => esc_html__( 'Follow us on Twitter', 'pricom' ),
                'icon'  => 'el el-twitter'
            );
            $args['share_icons'][] = array(
                'url'   => 'https://www.linkedin.com/company/redux-framework',
                'title' => esc_html__( 'Find us on LinkedIn', 'pricom' ),
                'icon'  => 'el el-linkedin'
            );

        }

    }

    // global $reduxConfig;
    $reduxConfig = new Redux_Framework_theme_options();
}